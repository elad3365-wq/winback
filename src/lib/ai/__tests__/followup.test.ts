import { describe, expect, it } from "vitest";

import {
  buildFollowupPrompt,
  discountsAllowed,
  mentionsDiscount,
  sanitizeDiscounts,
  type FollowupInputs,
} from "@/lib/ai/followup";

/**
 * Guardrail tests for the follow-up prompt builder and the discount sanitizer.
 * These are the rules that keep the AI from offering things the business never
 * turned on, so they are worth pinning down precisely.
 */

function inputs(overrides: Partial<FollowupInputs> = {}): FollowupInputs {
  return {
    customerName: "Dana Lopez",
    service: "roof replacement",
    estimateAmount: 8200,
    currency: "USD",
    leadStatus: "followup_1",
    businessName: "Miami Roofing LLC",
    businessType: "roofing",
    financingAvailable: false,
    paymentPlansAvailable: false,
    maximumDiscountPercent: 0,
    aiCanOfferDiscounts: false,
    businessHours: null,
    additionalRules: null,
    channel: "sms",
    tone: "professional",
    ...overrides,
  };
}

describe("discountsAllowed", () => {
  it("is true only when the business allows discounts AND the ceiling is above zero", () => {
    expect(discountsAllowed(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 5 }))).toBe(true);
    expect(discountsAllowed(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 0 }))).toBe(false);
    expect(discountsAllowed(inputs({ aiCanOfferDiscounts: false, maximumDiscountPercent: 5 }))).toBe(false);
    expect(discountsAllowed(inputs())).toBe(false);
  });
});

describe("buildFollowupPrompt — discount rules", () => {
  it("forbids discounts outright when they are not allowed", () => {
    const { system } = buildFollowupPrompt(inputs());
    expect(system).toContain("does NOT allow discounts");
    expect(system).not.toContain("you MAY reference a discount");
  });

  it("permits a capped discount when allowed, naming the exact ceiling", () => {
    const { system } = buildFollowupPrompt(inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 5 }));
    expect(system).toContain("up to 5%");
    expect(system).toContain("never more");
  });
});

describe("buildFollowupPrompt — financing / payment plans", () => {
  it("suppresses financing and payment plans by default", () => {
    const { system } = buildFollowupPrompt(inputs());
    expect(system).toContain("Do not mention financing");
    expect(system).toContain("Do not mention payment plans");
  });

  it("allows mentioning them when enabled", () => {
    const { system } = buildFollowupPrompt(
      inputs({ financingAvailable: true, paymentPlansAvailable: true }),
    );
    expect(system).toContain("Financing is available");
    expect(system).toContain("Payment plans are available");
  });
});

describe("buildFollowupPrompt — channel + tone + details", () => {
  it("uses SMS styling for sms and email styling for email", () => {
    expect(buildFollowupPrompt(inputs({ channel: "sms" })).system).toContain("Write a text message");
    expect(buildFollowupPrompt(inputs({ channel: "email" })).system).toContain("Write a brief email");
  });

  it("injects the selected tone", () => {
    expect(buildFollowupPrompt(inputs({ tone: "friendly" })).system).toContain("warm, friendly");
    expect(buildFollowupPrompt(inputs({ tone: "premium" })).system).toContain("premium and refined");
  });

  it("passes only the provided facts into the user message", () => {
    const { user } = buildFollowupPrompt(inputs({ additionalRules: "Never promise same-week install." }));
    expect(user).toContain("Customer name: Dana Lopez");
    expect(user).toContain("Service they got an estimate for: roof replacement");
    expect(user).toContain("Additional business rules to honour: Never promise same-week install.");
  });

  it("always frames the output as a draft and bans placeholders", () => {
    const { system } = buildFollowupPrompt(inputs());
    expect(system).toContain("DRAFT for the business owner to review");
    expect(system).toContain("No placeholders");
  });
});

describe("mentionsDiscount", () => {
  it("detects common discount phrasings", () => {
    for (const text of [
      "I can offer you 10% off",
      "here's a small discount",
      "we have a promo this month",
      "a coupon for your next job",
      "we can knock off some of the price",
    ]) {
      expect(mentionsDiscount(text)).toBe(true);
    }
  });

  it("does not flag ordinary copy", () => {
    expect(mentionsDiscount("Just following up on your roof estimate — happy to answer questions.")).toBe(false);
  });
});

describe("sanitizeDiscounts", () => {
  it("passes text through and reports a mention when discounts are allowed", () => {
    const r = sanitizeDiscounts("We can offer 5% off this week. Let us know.", true);
    expect(r.text).toContain("5% off");
    expect(r.mentionedDiscount).toBe(true);
  });

  it("drops discount sentences when discounts are not allowed", () => {
    const r = sanitizeDiscounts(
      "Thanks for considering us. We can give you 10% off if you book now. We'd love to help.",
      false,
    );
    expect(r.text).not.toMatch(/10% off/);
    expect(r.text).toContain("Thanks for considering us.");
    expect(r.text).toContain("We'd love to help.");
    expect(r.mentionedDiscount).toBe(false);
  });

  it("leaves clean text untouched when discounts are not allowed", () => {
    const clean = "Following up on your roof estimate — any questions?";
    expect(sanitizeDiscounts(clean, false)).toEqual({ text: clean, mentionedDiscount: false });
  });

  it("can empty the message if every sentence referenced a discount (caller treats as failure)", () => {
    const r = sanitizeDiscounts("Get 20% off now! Huge discount today!", false);
    expect(r.text).toBe("");
    expect(r.mentionedDiscount).toBe(false);
  });
});
