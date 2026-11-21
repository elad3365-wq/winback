import { beforeEach, describe, expect, it, vi } from "vitest";

/** Email reply workflow: guardrails, duplicate prevention, assisted "mark as sent". */

type Result = { data: unknown; error: unknown; count?: number | null };
const results: Record<string, Result[]> = {};
const calls: { client: string; table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
const activity = vi.fn();
const generateReply = vi.fn();
const sendApprovedReply = vi.fn();
const ctx = { user: { id: "owner-1" }, business: { id: "biz-1", owner_id: "owner-1", name: "Coastline Plumbing", currency: "USD", business_type: "plumbing", custom_business_type: null } };

function queue(table: string, ...items: Result[]) {
  results[table] = [...(results[table] ?? []), ...items];
}

function builder(client: string) {
  return (table: string) => {
    const next = () => results[table]?.shift() ?? { data: null, error: null, count: 0 };
    const record = { client, table, op: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "in", "gte", "order", "limit"]) {
      chain[m] = (col: string, val: unknown) => (record.filters.push([`${m}:${col}`, val]), chain);
    }
    chain.select = () => chain;
    chain.update = (payload: unknown) => ((record.op = "update"), (record.payload = payload), calls.push(record), chain);
    chain.insert = (payload: unknown) => ((record.op = "insert"), (record.payload = payload), calls.push(record), chain);
    chain.maybeSingle = async () => next();
    chain.single = async () => next();
    chain.then = (resolve: (r: Result) => unknown) => Promise.resolve(next()).then(resolve);
    return chain;
  };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: (...args: unknown[]) => activity(...args) }));
vi.mock("@/lib/business", () => ({ requireBusinessContext: async () => ctx }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: builder("user") }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder("admin") }) }));
vi.mock("@/lib/gmail/config", () => ({ isGmailFeatureEnabled: () => true }));
vi.mock("@/lib/gmail/connection", () => ({ disconnect: vi.fn(), GmailReconnectRequiredError: class extends Error {} }));
vi.mock("@/lib/gmail/sync", () => ({ syncInbox: vi.fn() }));
vi.mock("@/lib/gmail/reply", () => ({ generateReply: (...a: unknown[]) => generateReply(...a) }));
vi.mock("@/lib/gmail/send", () => ({
  sendApprovedReply: (...a: unknown[]) => sendApprovedReply(...a),
  sendingAllowedGlobally: () => process.env.WINBACK_GMAIL_ALLOW_SEND === "true",
}));

import {
  approveReplyAction,
  generateReplyAction,
  linkMessageToLeadAction,
  markReplySentManuallyAction,
  sendReplyAction,
} from "@/app/(app)/settings/email/actions";

const INBOUND = { id: "msg-1", business_id: "biz-1", direction: "inbound", lead_id: null, from_address: "dana@example.com", subject: "Price?", body_text: "How much?", snippet: "How much?" };

/** Queue the parallel reads generateReplyAction makes after the duplicate check. */
function queueContext(opts: { autonomy?: unknown; lead?: unknown; followups?: number; replies?: number } = {}) {
  queue("business_ai_settings", { data: null, error: null });
  if (opts.lead !== undefined) queue("leads", { data: opts.lead, error: null });
  queue("business_ai_autonomy", { data: opts.autonomy ?? null, error: null });
  queue("business_knowledge", { data: [{ title: "Drain cleaning", content: "$149 flat" }], error: null });
  queue("ai_messages", { data: null, error: null, count: opts.followups ?? 0 });
}

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  calls.length = 0;
  activity.mockReset();
  generateReply.mockReset();
  sendApprovedReply.mockReset();
  ctx.user.id = "owner-1";
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("WINBACK_GMAIL_ALLOW_SEND", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateReplyAction", () => {
  it("reuses an existing active draft without calling the model", async () => {
    queue("business_email_messages", { data: INBOUND, error: null });
    queue("business_email_replies", { data: { id: "r-old", body: "Hi Dana", prompt_inputs: { review_flags: [{ kind: "unverified_price", message: "m", match: "$99" }] } }, error: null });
    const result = await generateReplyAction("msg-1");
    expect(result.data?.replyId).toBe("r-old");
    expect(result.data?.flags).toHaveLength(1);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("refuses when AI is turned off for the business", async () => {
    queue("business_email_messages", { data: INBOUND, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 0 });
    queueContext({ autonomy: { level: "off" } });
    const result = await generateReplyAction("msg-1");
    expect(result.error).toMatch(/AI is turned off/);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("counts follow-ups and email replies together against the spend limit", async () => {
    queue("business_email_messages", { data: INBOUND, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 400 });
    queueContext({ autonomy: { level: "draft", daily_spend_limit_usd: 0.5 }, followups: 400 });
    const result = await generateReplyAction("msg-1");
    expect(result.error).toMatch(/spending limit/);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("refuses to draft to an unsubscribed lead", async () => {
    queue("business_email_messages", { data: { ...INBOUND, lead_id: "lead-1" }, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 0 });
    queueContext({ lead: { customer_name: "Dana", service: "Drain", estimate_amount: 149, unsubscribe_status: "unsubscribed" } });
    const result = await generateReplyAction("msg-1");
    expect(result.error).toMatch(/unsubscribed/);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("refuses a lead whose status the owner set to Unsubscribed", async () => {
    queue("business_email_messages", { data: { ...INBOUND, lead_id: "lead-1" }, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 0 });
    queueContext({ lead: { customer_name: "Dana", service: "Drain", estimate_amount: 149, status: "unsubscribed", unsubscribe_status: "subscribed" } });
    const result = await generateReplyAction("msg-1");
    expect(result.error).toMatch(/unsubscribed/);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("passes the knowledge base to the model and stores review flags with the draft", async () => {
    queue("business_email_messages", { data: INBOUND, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 0 }, { data: { id: "r-new" }, error: null });
    queueContext();
    const flags = [{ kind: "availability_claim", message: "Check the time", match: "Friday at 9am" }];
    generateReply.mockResolvedValue({ content: "Hi Dana, it's $149.", model: "m", discountOffered: false, flags });
    const result = await generateReplyAction("msg-1");
    expect(result).toEqual({ ok: true, data: { replyId: "r-new", body: "Hi Dana, it's $149.", flags } });
    expect(generateReply.mock.calls[0][0].knowledge).toEqual(["Drain cleaning: $149 flat"]);
    const insert = calls.find((c) => c.table === "business_email_replies" && c.op === "insert");
    expect((insert?.payload as { prompt_inputs: { review_flags: unknown } }).prompt_inputs.review_flags).toEqual(flags);
    expect((insert?.payload as { status: string }).status).toBe("draft");
  });

  it("hides a raw database error when saving fails", async () => {
    queue("business_email_messages", { data: INBOUND, error: null });
    queue("business_email_replies", { data: null, error: null }, { data: null, error: null, count: 0 }, { data: null, error: { message: 'new row violates row-level security policy for table "business_email_replies"' } });
    queueContext();
    generateReply.mockResolvedValue({ content: "Hi", model: "m", discountOffered: false, flags: [] });
    const result = await generateReplyAction("msg-1");
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/row-level/);
  });

  it("is refused when no AI key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await generateReplyAction("msg-1");
    expect(result.error).toBeDefined();
    expect(generateReply).not.toHaveBeenCalled();
  });
});

describe("approveReplyAction", () => {
  it("explains the owner-only rule instead of a raw trigger error", async () => {
    queue("business_email_replies", { data: null, error: { message: "reply: only the business owner may approve" } });
    expect((await approveReplyAction("r1")).error).toBe("Only the business owner can approve replies.");
  });
});

describe("sendReplyAction", () => {
  it("never sends while WINBACK_GMAIL_ALLOW_SEND is off, and doesn't leak the variable name", async () => {
    const result = await sendReplyAction("r1");
    expect(sendApprovedReply).not.toHaveBeenCalled();
    expect(result.error).toMatch(/turned off during the beta/);
    expect(result.error).not.toMatch(/WINBACK_GMAIL_ALLOW_SEND/);
  });
});

describe("markReplySentManuallyAction", () => {
  it("records an approved reply as sent via the service role and logs the timeline", async () => {
    queue("business_email_replies", { data: { id: "r1", status: "approved", lead_id: "lead-1", message_id: "msg-1" }, error: null });
    queue("business_email_replies", { data: { id: "r1" }, error: null });
    expect(await markReplySentManuallyAction("r1")).toEqual({ ok: true });
    const update = calls.find((c) => c.op === "update");
    expect(update?.client).toBe("admin");
    expect(update?.filters).toEqual(expect.arrayContaining([["eq:business_id", "biz-1"], ["eq:status", "approved"]]));
    expect((update?.payload as { status: string }).status).toBe("sent");
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ type: "email_reply_sent_manually", leadId: "lead-1" }));
  });

  it("refuses a reply that hasn't been approved", async () => {
    queue("business_email_replies", { data: { id: "r1", status: "draft", lead_id: null, message_id: "m" }, error: null });
    expect((await markReplySentManuallyAction("r1")).error).toMatch(/Approve the reply/);
    expect(calls.find((c) => c.op === "update")).toBeUndefined();
  });

  it("refuses non-owners", async () => {
    ctx.user.id = "member-2";
    expect((await markReplySentManuallyAction("r1")).error).toMatch(/Only the business owner/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a reply from another business (RLS returns nothing)", async () => {
    queue("business_email_replies", { data: null, error: null });
    expect((await markReplySentManuallyAction("r-other")).error).toBe("Reply not found.");
    expect(calls.find((c) => c.op === "update")).toBeUndefined();
  });
});

describe("linkMessageToLeadAction", () => {
  it("refuses a lead that isn't in this business", async () => {
    queue("leads", { data: null, error: null });
    expect((await linkMessageToLeadAction("msg-1", "lead-x")).error).toMatch(/no longer exists/);
    expect(calls).toHaveLength(0);
  });

  it("pauses follow-ups for the lead and logs the reply on its timeline", async () => {
    queue("leads", { data: { id: "lead-1" }, error: null }, { data: { id: "lead-1" }, error: null });
    queue("business_email_messages", { data: { id: "msg-1", direction: "inbound", body_text: "Sounds good, when can you come?", snippet: null }, error: null });
    expect(await linkMessageToLeadAction("msg-1", "lead-1")).toEqual({ ok: true });
    const leadUpdate = calls.find((c) => c.table === "leads" && c.op === "update");
    expect(leadUpdate?.payload).toEqual({ autopilot_paused: true, next_follow_up_at: null });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ type: "customer_replied", metadata: expect.objectContaining({ follow_ups_paused: true }) }));
    // ai_audit_log is service-role-only; it must not be written from the user session.
    expect(calls.find((c) => c.table === "ai_audit_log")).toBeUndefined();
  });

  it("marks the lead unsubscribed when the reply asks to stop", async () => {
    queue("leads", { data: { id: "lead-1" }, error: null }, { data: { id: "lead-1" }, error: null });
    queue("business_email_messages", { data: { id: "msg-1", direction: "inbound", body_text: "Please remove me from your list", snippet: null }, error: null });
    await linkMessageToLeadAction("msg-1", "lead-1");
    const leadUpdate = calls.find((c) => c.table === "leads" && c.op === "update");
    expect(leadUpdate?.payload).toEqual({ unsubscribe_status: "unsubscribed", next_follow_up_at: null });
  });
});
