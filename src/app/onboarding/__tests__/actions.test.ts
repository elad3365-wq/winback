import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_ONBOARDING, type OnboardingData } from "@/lib/onboarding";

type Result = { data: unknown; error: unknown };
const results: Record<string, Result[]> = {};
const calls: { table: string; op: string }[] = [];
let role: "owner" | "member" = "owner";

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.select = () => chain;
  for (const op of ["update", "upsert"]) chain[op] = () => (calls.push({ table, op }), chain);
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business", () => ({
  requireBusinessContext: async () => ({ user: { id: "u1" }, business: { id: "b1" }, role }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: builder }) }));

import { completeOnboardingAction } from "@/app/onboarding/actions";

const valid: OnboardingData = {
  ...EMPTY_ONBOARDING,
  businessName: "Fictional Roofing",
  businessType: "Roofing",
  phone: "+13055550142",
  country: "US",
  state: "FL",
  city: "Miami",
  currentFollowUpMethod: "No",
};

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  calls.length = 0;
  role = "owner";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("completeOnboardingAction", () => {
  it("saves the business, AI rules and profile for an owner", async () => {
    results.businesses = [{ data: [{ id: "b1" }], error: null }];
    results.business_ai_settings = [{ data: null, error: null }];
    results.profiles = [{ data: [{ id: "u1" }], error: null }];
    expect(await completeOnboardingAction(valid)).toEqual({ status: "success" });
    expect(calls.map((c) => c.table)).toEqual(["businesses", "business_ai_settings", "profiles"]);
  });

  it("does not claim success when the business update matched no row", async () => {
    results.businesses = [{ data: [], error: null }];
    const res = await completeOnboardingAction(valid);
    expect(res.status).toBe("error");
    expect(calls.some((c) => c.table === "profiles")).toBe(false);
  });

  it("lets a team member finish without overwriting the owner's business or AI rules", async () => {
    role = "member";
    results.profiles = [{ data: [{ id: "u1" }], error: null }];
    expect(await completeOnboardingAction(valid)).toEqual({ status: "success" });
    expect(calls.map((c) => c.table)).toEqual(["profiles"]);
  });

  it("reports a failed profile save", async () => {
    results.businesses = [{ data: [{ id: "b1" }], error: null }];
    results.business_ai_settings = [{ data: null, error: null }];
    results.profiles = [{ data: null, error: { message: "boom" } }];
    expect((await completeOnboardingAction(valid)).status).toBe("error");
  });
});
