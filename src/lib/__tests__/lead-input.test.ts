import { describe, expect, it } from "vitest";

import { friendlyLeadError, parseLeadInput } from "@/lib/lead-input";

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const values = {
    customer_name: "  Dana Test ",
    phone: "+1 305 555 0111",
    service: "Water heater",
    estimate_amount: "1850",
    status: "new",
    follow_up_date: "",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("parseLeadInput", () => {
  it("accepts a normal lead and trims fields", () => {
    expect(parseLeadInput(form())).toEqual({
      customer_name: "Dana Test",
      phone: "+1 305 555 0111",
      service: "Water heater",
      estimate_amount: 1850,
      status: "new",
      follow_up_date: null,
    });
  });

  it("treats a blank amount as 0 and tolerates $ and commas", () => {
    expect(parseLeadInput(form({ estimate_amount: "" }))).toMatchObject({ estimate_amount: 0 });
    expect(parseLeadInput(form({ estimate_amount: "$1,850.555" }))).toMatchObject({ estimate_amount: 1850.56 });
  });

  it.each([
    [{ customer_name: "  " }, "Customer name is required."],
    [{ customer_name: "x".repeat(121) }, "Customer name must be 120 characters or fewer."],
    [{ phone: "" }, "Phone number is required."],
    [{ phone: "call me" }, "Enter a valid phone number."],
    [{ phone: "1".repeat(31) }, "Enter a valid phone number."],
    [{ service: "" }, "Service is required."],
    [{ service: "s".repeat(121) }, "Service must be 120 characters or fewer."],
    [{ status: "won" }, "Pick a valid status."],
    [{ estimate_amount: "-5" }, "Estimate amount must be a positive number."],
    [{ estimate_amount: "abc" }, "Estimate amount must be a positive number."],
    [{ estimate_amount: "1e12" }, "Estimate amount is too large."],
    [{ follow_up_date: "2026-02-30" }, "Follow-up date must be a valid date."],
    [{ follow_up_date: "tomorrow" }, "Follow-up date must be a valid date."],
  ])("rejects %o", (overrides, message) => {
    expect(parseLeadInput(form(overrides))).toEqual({ error: message });
  });

  it("keeps a real follow-up date", () => {
    expect(parseLeadInput(form({ follow_up_date: "2026-11-20" }))).toMatchObject({ follow_up_date: "2026-11-20" });
  });
});

describe("friendlyLeadError", () => {
  it("never exposes raw database text", () => {
    const raw = { code: "42501", message: 'new row violates row-level security policy for table "leads"' };
    expect(friendlyLeadError(raw)).not.toContain("row-level");
    expect(friendlyLeadError({ code: "XX000", message: "boom" })).toBe("Could not save the lead. Please try again.");
    expect(friendlyLeadError(null)).toBe("Could not save the lead. Please try again.");
  });
});
