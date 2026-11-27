import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RLS turns a blocked UPDATE/DELETE into "0 rows, no error" (pinned down on
 * WinBack-Test by supabase/tests/crm_onboarding_flow.sql). These tests make
 * sure the actions report that as a failure, not a success.
 */

type Result = { data: unknown; error: unknown };
const results: Record<string, Result[]> = {};
const calls: { table: string; op: string; payload?: unknown }[] = [];
const activity = vi.fn();

function queue(table: string, ...items: Result[]) {
  results[table] = [...(results[table] ?? []), ...items];
}

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["eq", "in", "order", "limit"]) chain[m] = self;
  chain.select = () => chain;
  chain.update = (payload: unknown) => (calls.push({ table, op: "update", payload }), chain);
  chain.delete = () => (calls.push({ table, op: "delete" }), chain);
  chain.insert = (payload: unknown) => (calls.push({ table, op: "insert", payload }), chain);
  chain.maybeSingle = async () => next();
  chain.single = async () => next();
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logActivity: (...args: unknown[]) => activity(...args) }));
vi.mock("@/lib/business", () => ({
  requireBusinessContext: async () => ({ user: { id: "user-1" }, business: { id: "biz-1" }, role: "owner" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: builder }) }));

import { deleteLeadAction, updateLeadAction, updateLeadStatusAction } from "@/app/(app)/leads/actions";
import { LEAD_NOT_FOUND } from "@/lib/lead-input";

function editForm(status = "interested") {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    id: "lead-1",
    customer_name: "Dana",
    phone: "+13055550111",
    service: "Roof",
    estimate_amount: "100",
    status,
  }))
    fd.set(k, v);
  return fd;
}

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  calls.length = 0;
  activity.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updateLeadStatusAction", () => {
  it("logs the change when a row was updated", async () => {
    queue("leads", { data: { status: "new" }, error: null }, { data: [{ id: "lead-1" }], error: null });
    expect(await updateLeadStatusAction("lead-1", "interested")).toEqual({ error: undefined });
    expect(activity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "status_changed", metadata: { from: "new", to: "interested" } }),
    );
  });

  it("fails instead of a silent success when the lead is not in this business", async () => {
    queue("leads", { data: null, error: null });
    expect(await updateLeadStatusAction("lead-x", "lost")).toEqual({ error: LEAD_NOT_FOUND });
    expect(calls.some((c) => c.op === "update")).toBe(false);
    expect(activity).not.toHaveBeenCalled();
  });

  it("fails when RLS blocks the update (0 rows, no error)", async () => {
    queue("leads", { data: { status: "new" }, error: null }, { data: [], error: null });
    expect(await updateLeadStatusAction("lead-1", "lost")).toEqual({ error: LEAD_NOT_FOUND });
    expect(activity).not.toHaveBeenCalled();
  });

  it("hides raw database errors", async () => {
    queue(
      "leads",
      { data: { status: "new" }, error: null },
      { data: null, error: { code: "42501", message: "new row violates row-level security policy" } },
    );
    const res = await updateLeadStatusAction("lead-1", "lost");
    expect(res.error).toBeDefined();
    expect(res.error).not.toContain("row-level");
  });
});

describe("updateLeadAction", () => {
  it("records a status change made in the edit form", async () => {
    queue("leads", { data: { status: "new" }, error: null }, { data: [{ id: "lead-1" }], error: null });
    const res = await updateLeadAction({ status: "idle" }, editForm("interested"));
    expect(res.status).toBe("success");
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ type: "status_changed" }));
  });

  it("does not log activity when the status is unchanged", async () => {
    queue("leads", { data: { status: "interested" }, error: null }, { data: [{ id: "lead-1" }], error: null });
    expect((await updateLeadAction({ status: "idle" }, editForm("interested"))).status).toBe("success");
    expect(activity).not.toHaveBeenCalled();
  });

  it("reports an error when nothing was updated", async () => {
    queue("leads", { data: { status: "new" }, error: null }, { data: [], error: null });
    expect(await updateLeadAction({ status: "idle" }, editForm())).toEqual({ status: "error", error: LEAD_NOT_FOUND });
  });
});

describe("deleteLeadAction", () => {
  it("succeeds only when a row was deleted", async () => {
    queue("leads", { data: [{ id: "lead-1" }], error: null });
    expect(await deleteLeadAction("lead-1")).toEqual({ error: undefined });
    queue("leads", { data: [], error: null });
    expect(await deleteLeadAction("lead-1")).toEqual({ error: LEAD_NOT_FOUND });
  });
});
