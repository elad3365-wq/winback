import { describe, expect, it } from "vitest";

import { buildReplyPrompt, replyDiscountsAllowed, type ReplyInputs } from "@/lib/gmail/reply";

function inputs(overrides: Partial<ReplyInputs> = {}): ReplyInputs {
  return {
    businessName: "Miami Roofing LLC",
    businessType: "roofing",
    financingAvailable: false,
    paymentPlansAvailable: false,
    maximumDiscountPercent: 0,
    aiCanOfferDiscounts: false,
    businessHours: "Mon–Fri 8am–6pm",
    additionalRules: "Never promise same-week installation.",
    tone: "professional",
    currency: "USD",
    inbound: { fromName: "Dana", subject: "Timing?", bodyText: "Can you start next week?" },
    lead: null,
    ...overrides,
  };
}

describe("replyDiscountsAllowed", () => {
  it("is true only when allowed AND the ceiling is above zero", () => {
    expect(replyDiscountsAllowed(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 5 }))).toBe(true);
    expect(replyDiscountsAllowed(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 0 }))).toBe(false);
    expect(replyDiscountsAllowed(inputs())).toBe(false);
  });
});

describe("buildReplyPrompt", () => {
  it("forbids discounts when not allowed and permits a capped one when allowed", () => {
    expect(buildReplyPrompt(inputs()).system).toContain("does NOT allow discounts");
    const allowed = buildReplyPrompt(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 10 }));
    expect(allowed.system).toContain("up to 10%");
  });

  it("instructs the model not to guess when a fact is missing", () => {
    expect(buildReplyPrompt(inputs()).system).toContain("do NOT guess");
  });

  it("grounds the reply in the actual inbound message and business rules", () => {
    const { user, system } = buildReplyPrompt(inputs());
    expect(user).toContain("Can you start next week?");
    expect(user).toContain("Business hours: Mon–Fri 8am–6pm");
    expect(user).toContain("Additional business rules to honour: Never promise same-week installation.");
    expect(system).toContain("DRAFT the business owner will review");
  });

  it("includes linked-lead facts when present", () => {
    const { user } = buildReplyPrompt(
      inputs({ lead: { customerName: "Dana Lopez", service: "roof replacement", estimateAmount: 8200 } }),
    );
    expect(user).toContain("roof replacement");
    expect(user).toContain("$8,200");
  });
});
