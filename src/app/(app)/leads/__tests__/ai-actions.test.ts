import { beforeEach, describe, expect, it, vi } from "vitest";

/** Approval workflow: draft → edited → approved → sent (manually) / cancelled. */

type Result = { data: unknown; error: unknown };
const results: Record<string, Result[]> = {};
const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
const activity = vi.fn();

function queue(table: string, ...items: Result[]) {
  results[table] = [...(results[table] ?? []), ...items];
}

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null };
  const record = { table, op: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => (record.filters.push([col, val]), chain);
  chain.in = (col: string, val: unknown) => (record.filters.push([col, val]), chain);
  chain.select = () => chain;
  chain.update = (payload: unknown) => ((record.op = "update"), (record.payload = payload), calls.push(record), chain);
  chain.insert = (payload: unknown) => ((record.op = "insert"), (record.payload = payload), calls.push(record), chain);
  chain.maybeSingle = async () => next();
  chain.then = (resolve: (r: Result) => unknown) => Promise.resolve(next()).then(resolve);
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: (...args: unknown[]) => activity(...args) }));
vi.mock("@/lib/business", () => ({
  requireBusinessContext: async () => ({ user: { id: "user-1" }, business: { id: "biz-1" }, role: "owner" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: builder }) }));

import {
  approveAiMessageAction,
  markAiMessageSentManuallyAction,
  saveAiMessageEditAction,
} from "@/app/(app)/leads/ai-actions";

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  calls.length = 0;
  activity.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveAiMessageEditAction", () => {
  it("records a human edit as status 'edited'", async () => {
    queue("ai_messages", { data: { id: "m1", status: "edited" }, error: null });
    expect(await saveAiMessageEditAction("m1", "  Hi Dana  ")).toEqual({ status: "edited" });
    expect(calls[0].payload).toEqual({ message: "Hi Dana", status: "edited" });
    expect(calls[0].filters).toContainEqual(["business_id", "biz-1"]);
  });

  it("hides raw database errors from the owner", async () => {
    queue("ai_messages", { data: null, error: { message: 'new row violates row-level security policy for table "ai_messages"' } });
    const result = await saveAiMessageEditAction("m1", "Hi");
    expect(result.error).not.toMatch(/row-level/);
  });
});

describe("approveAiMessageAction", () => {
  it("logs the approval on the lead timeline", async () => {
    queue("ai_messages", { data: { id: "m1", status: "approved", approved_at: "2026-11-19T07:00:00Z", lead_id: "lead-1" }, error: null });
    expect(await approveAiMessageAction("m1")).toEqual({ status: "approved", approvedAt: "2026-11-19T07:00:00Z" });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", type: "ai_message_approved" }));
  });
});

describe("markAiMessageSentManuallyAction", () => {
  it("only moves an approved message to sent and counts a contact", async () => {
    queue("ai_messages", { data: { id: "m1", status: "sent", lead_id: "lead-1", channel: "sms" }, error: null });
    queue("leads", { data: { follow_up_count: 1 }, error: null }, { data: null, error: null });
    expect(await markAiMessageSentManuallyAction("m1")).toEqual({ status: "sent" });

    const msgUpdate = calls.find((c) => c.table === "ai_messages" && c.op === "update")!;
    expect(msgUpdate.payload).toMatchObject({ status: "sent" });
    expect(msgUpdate.filters).toContainEqual(["status", "approved"]);
    const leadUpdate = calls.find((c) => c.table === "leads" && c.op === "update")!;
    expect(leadUpdate.payload).toMatchObject({ follow_up_count: 2 });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ type: "ai_message_sent_manually" }));
  });

  it("refuses an unapproved message without touching the lead", async () => {
    queue("ai_messages", { data: null, error: null });
    const result = await markAiMessageSentManuallyAction("m1");
    expect(result.error).toMatch(/approved/);
    expect(calls.some((c) => c.table === "leads")).toBe(false);
    expect(activity).not.toHaveBeenCalled();
  });
});
