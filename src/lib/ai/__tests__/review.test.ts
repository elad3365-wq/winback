import { describe, expect, it } from "vitest";

import { parseReviewFlags, reviewDraft, type ReviewContext } from "@/lib/ai/review";

function ctx(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    estimateAmount: 8200,
    discountsAllowed: false,
    maximumDiscountPercent: 0,
    financingAvailable: false,
    paymentPlansAvailable: false,
    verifiedText: "",
    ...overrides,
  };
}

const kinds = (text: string, c: ReviewContext) => reviewDraft(text, c).flags.map((f) => f.kind);

describe("reviewDraft — prices", () => {
  it("accepts the estimate amount however it is formatted", () => {
    expect(kinds("Your $8,200 estimate for the roof is still valid.", ctx())).toEqual([]);
    expect(kinds("Your $8200.00 estimate is ready.", ctx())).toEqual([]);
  });

  it("flags a price that is not the estimate or in the knowledge base", () => {
    const result = reviewDraft("We could do it for $7,500 instead.", ctx());
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({ kind: "unverified_price", match: "$7,500" });
    // Flags never rewrite the text — the owner decides.
    expect(result.text).toBe("We could do it for $7,500 instead.");
  });

  it("accepts a price the owner put in the knowledge base", () => {
    expect(kinds("Gutter cleaning is $180.", ctx({ verifiedText: "Gutter cleaning: $180 single story" }))).toEqual([]);
  });

  it("recognises worded currencies", () => {
    expect(kinds("Only 500 dollars more for the upgrade.", ctx())).toEqual(["unverified_price"]);
  });
});

describe("reviewDraft — discounts over the ceiling", () => {
  it("removes a sentence offering more than the allowed percentage", () => {
    const result = reviewDraft("Thanks for considering us. We can take 15% off this week. Reply anytime!", ctx({
      discountsAllowed: true,
      maximumDiscountPercent: 10,
    }));
    expect(result.text).toBe("Thanks for considering us. Reply anytime!");
    expect(result.flags.map((f) => f.kind)).toContain("discount_over_limit");
  });

  it("keeps a discount within the ceiling", () => {
    const result = reviewDraft("We can take 10% off if you book.", ctx({ discountsAllowed: true, maximumDiscountPercent: 10 }));
    expect(result.text).toBe("We can take 10% off if you book.");
    expect(result.flags).toEqual([]);
  });
});

describe("reviewDraft — guarantees, availability, financing", () => {
  it("flags a guarantee the business never stated", () => {
    expect(kinds("All our work comes with a lifetime warranty.", ctx())).toEqual(
      expect.arrayContaining(["unverified_guarantee"]),
    );
  });

  it("accepts a warranty that is in the knowledge base", () => {
    expect(kinds("Remember our 2-year warranty.", ctx({ verifiedText: "Workmanship warranty: 2 years" }))).toEqual([]);
  });

  it("flags specific appointment offers", () => {
    expect(kinds("We have an opening this Thursday.", ctx())).toContain("availability_claim");
    expect(kinds("We can come tomorrow at 9am.", ctx())).toContain("availability_claim");
  });

  it("does not flag a generic invitation to schedule", () => {
    expect(kinds("Reply here and we'll find a time that works for you.", ctx())).toEqual([]);
  });

  it("flags financing and payment plans that are not offered, but not when they are", () => {
    expect(kinds("Financing is available.", ctx())).toEqual(["financing_not_offered"]);
    expect(kinds("We offer monthly payments.", ctx())).toEqual(["payment_plan_not_offered"]);
    expect(kinds("Financing is available.", ctx({ financingAvailable: true }))).toEqual([]);
  });
});

describe("parseReviewFlags", () => {
  it("keeps well-formed flags and drops junk", () => {
    expect(parseReviewFlags(null)).toEqual([]);
    expect(parseReviewFlags([{ kind: "unverified_price", message: "x", match: "$1" }, { nope: 1 }, "x"])).toHaveLength(1);
  });
});
