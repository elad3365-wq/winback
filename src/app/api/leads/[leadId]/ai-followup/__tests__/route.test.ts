import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner's "Generate AI Follow-up" endpoint: knowledge base in the prompt,
 * per-business AI controls, unsubscribed leads, and output review flags.
 */

type Result = { data?: unknown; error?: unknown; count?: number };
const results: Record<string, Result[]> = {};
const inserts: { table: string; payload: unknown }[] = [];
const generate = vi.fn();

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "gte", "order", "limit", "select"]) chain[m] = () => chain;
  chain.insert = (payload: unknown) => (inserts.push({ table, payload }), chain);
  chain.maybeSingle = async () => next();
  chain.single = async () => next();
  chain.then = (resolve: (r: Result) => unknown) => Promise.resolve(next()).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: builder,
  }),
}));
vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  return { ...actual, isAiConfigured: () => true, generateFollowup: (...a: unknown[]) => generate(...a) };
});

import { POST } from "@/app/api/leads/[leadId]/ai-followup/route";

const lead = {
  id: "lead-1",
  business_id: "biz-1",
  customer_name: "Dana",
  service: "roof repair",
  estimate_amount: 1200,
  status: "followup_1",
  unsubscribe_status: "subscribed",
};

function setup(opts: { autonomy?: unknown; lead?: unknown; draftsToday?: number } = {}) {
  results.leads = [{ data: opts.lead ?? lead, error: null }];
  results.businesses = [{ data: { id: "biz-1", name: "Miami Roofing", business_type: "roofing", currency: "USD" } }];
  results.business_ai_settings = [{ data: { tone: "friendly", financing_available: false } }];
  results.business_ai_autonomy = [{ data: opts.autonomy ?? null }];
  results.business_knowledge = [{ data: [{ kind: "policy", title: "Warranty", content: "2 years on workmanship" }] }];
  // 1st count: drafts today (spend), 2nd count: last minute (rate limit)
  results.ai_messages = [
    { count: opts.draftsToday ?? 0 },
    { count: 0 },
    { data: { id: "msg-1", created_at: "2026-11-19T07:00:00Z" }, error: null },
  ];
}

const call = () =>
  POST(new Request("http://x/api/leads/lead-1/ai-followup", { method: "POST", body: JSON.stringify({ channel: "sms" }) }) as never, {
    params: Promise.resolve({ leadId: "lead-1" }),
  });

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  inserts.length = 0;
  generate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/leads/[leadId]/ai-followup", () => {
  it("passes the approved knowledge base to the model and returns review flags", async () => {
    setup();
    generate.mockResolvedValue({
      content: "Hi Dana! Your roof repair estimate comes with our 2 years warranty. We can come Friday at 9am.",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(generate.mock.calls[0][0].knowledge).toEqual(["Warranty: 2 years on workmanship"]);
    const body = await res.json();
    expect(body.flags.map((f: { kind: string }) => f.kind)).toEqual(["availability_claim"]);
    const saved = inserts.find((i) => i.table === "ai_messages")!.payload as { status: string; prompt_inputs: { review_flags: unknown[] } };
    expect(saved.status).toBe("draft");
    expect(saved.prompt_inputs.review_flags).toHaveLength(1);
  });

  it("refuses when the owner turned AI off, without calling the model", async () => {
    setup({ autonomy: { level: "off" } });
    const res = await call();
    expect(res.status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("still lets a human generate during an emergency stop", async () => {
    setup({ autonomy: { level: "draft", emergency_stop: true } });
    generate.mockResolvedValue({ content: "Hi Dana, any questions about the estimate?", model: "claude-sonnet-5-5" });
    expect((await call()).status).toBe(200);
  });

  it("stops at the daily spend limit", async () => {
    setup({ autonomy: { level: "draft", daily_spend_limit_usd: "0.004" }, draftsToday: 1 });
    const res = await call();
    expect(res.status).toBe(429);
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses unsubscribed customers", async () => {
    setup({ lead: { ...lead, unsubscribe_status: "unsubscribed" } });
    expect((await call()).status).toBe(409);
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses a lead the owner moved to the Unsubscribed status by hand", async () => {
    setup({ lead: { ...lead, status: "unsubscribed", unsubscribe_status: "subscribed" } });
    expect((await call()).status).toBe(409);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a friendly error and saves nothing when the model refuses", async () => {
    setup();
    const { AiGenerationError } = await import("@/lib/ai/anthropic");
    generate.mockRejectedValue(new AiGenerationError("refusal"));
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/declined/);
    expect(inserts).toHaveLength(0);
  });
});
