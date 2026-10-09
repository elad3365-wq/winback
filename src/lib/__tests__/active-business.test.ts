import { describe, expect, it } from "vitest";

import { isBusinessId, pickActiveBusiness, type BusinessSummary } from "@/lib/active-business";

const FRAGRAMOOD: BusinessSummary = {
  id: "0f9b58c9-5410-4a38-bb2c-a8bb1a4527ba",
  name: "FragraMood",
  role: "owner",
};
const MIAMI: BusinessSummary = {
  id: "7b0d47a9-4868-431b-a31d-3fec8fac48d8",
  name: "Miami Roofing LLC",
  role: "owner",
};

describe("pickActiveBusiness", () => {
  it("returns null when the user belongs to no business", () => {
    expect(pickActiveBusiness([], MIAMI.id)).toBeNull();
  });

  it("defaults to the oldest business when nothing was chosen", () => {
    expect(pickActiveBusiness([FRAGRAMOOD, MIAMI], undefined)).toBe(FRAGRAMOOD);
  });

  it("uses the saved choice when the user is a member of it", () => {
    expect(pickActiveBusiness([FRAGRAMOOD, MIAMI], MIAMI.id)).toBe(MIAMI);
  });

  it("ignores a saved business the user does not belong to", () => {
    const someoneElses = "11111111-2222-3333-4444-555555555555";
    expect(pickActiveBusiness([FRAGRAMOOD, MIAMI], someoneElses)).toBe(FRAGRAMOOD);
  });

  it("ignores a malformed cookie value", () => {
    expect(pickActiveBusiness([FRAGRAMOOD, MIAMI], "' or 1=1 --")).toBe(FRAGRAMOOD);
  });
});

describe("isBusinessId", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(isBusinessId(MIAMI.id)).toBe(true);
    expect(isBusinessId("miami")).toBe(false);
    expect(isBusinessId(null)).toBe(false);
  });
});
