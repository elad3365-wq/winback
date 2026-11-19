import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily follow-up cron (the one scheduled in vercel.json) must honour the
 * per-business AI controls: emergency stop / AI off / limits skip the lead and
 * leave it due, without calling the model.
 */

type Result = { data?: unknown; error?: unknown };
const results: Record<string, Result[]> = {};
const writes: { table: string; op: string; payload: unknown }[] = [];
const generate = vi.fn();

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "in", "gte", "lte", "not", "order", "limit", "select"]) chain[m] = () => chain;
  chain.insert = (payload: unknown) => (writes.push({ table, op: "insert", payload }), chain);
  chain.update = (payload: unknown) => (writes.push({ table, op: "update", payload }), chain);
  chain.maybeSingle = async () => next();
  chain.single = async () => next();
  chain.then = (resolve: (r: Result) => unknown) => Promise.resolve(next()).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: builder }),
  isAutopilotConfigured: () => true,
}));
vi.mock("@/lib/ai/anthropic", () => ({ generateFollowup: (...a: unknown[]) => generate(...a) }));

import { GET } from "@/app/api/cron/followups/route";

const lead = {
  id: "lead-1",
  business_id: "biz-1",
  customer_name: "Dana",
  service: "roof",
  estimate_amount: 900,
  status: "new",
  follow_up_count: 0,
};

function setup(autonomy: unknown) {
  results.leads = [{ data: [lead] }];
  results.business_ai_settings = [
    {
      data: [
        {
          business_id: "biz-1",
          autopilot_enabled: true,
          maximum_followups: 3,
          business_hours: null,
          financing_available: false,
          payment_plans_available: false,
          maximum_discount_percent: 0,
          ai_can_offer_discounts: false,
          additional_rules: null,
          tone: "friendly",
          first_followup_delay_minutes: 60,
          second_followup_delay_minutes: 60,
          third_followup_delay_minutes: 60,
        },
      ],
    },
  ];
  results.businesses = [{ data: [{ id: "biz-1", name: "Miami Roofing", currency: "USD" }] }];
  results.business_ai_autonomy = [{ data: autonomy ? [{ business_id: "biz-1", ...autonomy }] : [] }];
  results.business_knowledge = [{ data: [] }];
  // today's drafts, then idempotency lookup, then insert result
  results.ai_messages = [{ data: [] }, { data: null }, { data: { id: "msg-1" } }];
}

const run = () =>
  GET(new Request("http://x/api/cron/followups", { headers: { authorization: "Bearer s3cret" } }) as never);

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  writes.length = 0;
  generate.mockReset();
  process.env.CRON_SECRET = "s3cret";
});

describe("GET /api/cron/followups — AI controls", () => {
  it("skips drafting while the emergency stop is on and leaves the lead due", async () => {
    setup({ level: "draft", emergency_stop: true });
    const body = await (await run()).json();
    expect(generate).not.toHaveBeenCalled();
    expect(body.skipped).toEqual({ emergency_stop: 1 });
    expect(writes.some((w) => w.table === "leads")).toBe(false);
    expect(writes).toContainEqual(
      expect.objectContaining({ table: "ai_audit_log", payload: expect.objectContaining({ event: "skipped_emergency_stop" }) }),
    );
  });

  it("skips drafting when AI is off for the business", async () => {
    setup({ level: "off" });
    const body = await (await run()).json();
    expect(generate).not.toHaveBeenCalled();
    expect(body.skipped).toEqual({ ai_off: 1 });
  });

  it("drafts normally when no controls block it", async () => {
    setup(null);
    generate.mockResolvedValue({ content: "Hi Dana, any questions on the roof estimate?", model: "claude-sonnet-5-5" });
    const body = await (await run()).json();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(body.drafted).toBe(1);
  });
});
