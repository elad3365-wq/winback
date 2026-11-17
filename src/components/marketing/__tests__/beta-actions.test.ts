import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const configured = vi.fn(() => true);

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => configured() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ insert }) }),
}));

import { submitBetaAction } from "@/components/marketing/beta-actions";
import { INITIAL_BETA_FORM_STATE } from "@/components/marketing/beta-form-state";

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const values = {
    name: "Dana Test",
    business_name: "Fictional Roofing",
    email: "Dana@Example.com",
    business_type: "Roofing",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("submitBetaAction", () => {
  beforeEach(() => {
    insert.mockReset();
    configured.mockReset();
    configured.mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns success only after a confirmed insert", async () => {
    insert.mockResolvedValue({ error: null });
    const res = await submitBetaAction(INITIAL_BETA_FORM_STATE, form());
    expect(res.status).toBe("success");
    expect(insert).toHaveBeenCalledWith({
      name: "Dana Test",
      business_name: "Fictional Roofing",
      email: "dana@example.com",
      business_type: "Roofing",
    });
  });

  it("shows an error (not success) when the database rejects the insert", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const res = await submitBetaAction(INITIAL_BETA_FORM_STATE, form());
    expect(res.status).toBe("error");
  });

  it("shows an error when the insert throws", async () => {
    insert.mockRejectedValue(new Error("network down"));
    const res = await submitBetaAction(INITIAL_BETA_FORM_STATE, form());
    expect(res.status).toBe("error");
  });

  it("shows an error when Supabase is not configured", async () => {
    configured.mockReturnValue(false);
    const res = await submitBetaAction(INITIAL_BETA_FORM_STATE, form());
    expect(res.status).toBe("error");
    expect(insert).not.toHaveBeenCalled();
  });

  it("validates input before touching the database", async () => {
    const res = await submitBetaAction(INITIAL_BETA_FORM_STATE, form({ email: "nope" }));
    expect(res).toEqual({ status: "error", error: "Please enter a valid email address." });
    const long = await submitBetaAction(INITIAL_BETA_FORM_STATE, form({ name: "x".repeat(201) }));
    expect(long.status).toBe("error");
    expect(insert).not.toHaveBeenCalled();
  });
});
