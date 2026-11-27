import { describe, expect, it } from "vitest";

import {
  assertSameTenant,
  dedupeKey,
  isDuplicate,
  isSameTenant,
  requiresHumanReview,
  validateOutboundDraft,
} from "@/lib/ai/autopilot/supervisor";

describe("tenant isolation", () => {
  it("accepts same tenant, rejects cross-tenant", () => {
    expect(isSameTenant("b1", "b1")).toBe(true);
    expect(isSameTenant("b1", "b2")).toBe(false);
    expect(() => assertSameTenant("b1", "b1")).not.toThrow();
    expect(() => assertSameTenant("b1", "b2")).toThrow(/Tenant isolation/);
  });
});

describe("dedupe keys", () => {
  it("are stable and detect duplicates", () => {
    const k = dedupeKey({ businessId: "b1", type: "followup", entityId: "lead1", step: 2 });
    expect(k).toBe("b1:followup:lead1:2");
    expect(dedupeKey({ businessId: "b1", type: "followup", entityId: "lead1", step: 2 })).toBe(k);
    expect(isDuplicate(["x", k], k)).toBe(true);
    expect(isDuplicate(["x"], k)).toBe(false);
  });
});

describe("validateOutboundDraft", () => {
  it("passes a clean message", () => {
    expect(validateOutboundDraft("Following up on your estimate — any questions?", "draft_reply", {
      discountsAllowed: false,
      recipientUnsubscribed: false,
    })).toEqual({ ok: true, violations: [] });
  });

  it("fails closed on empty body, unsubscribed recipient, and unauthorized discount", () => {
    expect(validateOutboundDraft("   ", "draft_reply", { discountsAllowed: true, recipientUnsubscribed: false }).violations).toContain("empty_body");
    expect(validateOutboundDraft("hi", "send_email", { discountsAllowed: true, recipientUnsubscribed: true }).violations).toContain("recipient_unsubscribed");
    expect(validateOutboundDraft("here's 10% off", "draft_reply", { discountsAllowed: false, recipientUnsubscribed: false }).violations).toContain("unauthorized_discount");
  });

  it("allows a discount mention when the business permits discounts", () => {
    expect(validateOutboundDraft("we can offer 5% off", "draft_reply", { discountsAllowed: true, recipientUnsubscribed: false }).ok).toBe(true);
  });
});

describe("requiresHumanReview", () => {
  it("routes to owner unless allowed, not high-impact, and confident", () => {
    expect(requiresHumanReview({ autonomyDecision: "allow", confidence: 0.9, highImpact: false })).toBe(false);
    expect(requiresHumanReview({ autonomyDecision: "needs_approval", confidence: 0.9, highImpact: false })).toBe(true);
    expect(requiresHumanReview({ autonomyDecision: "allow", confidence: 0.9, highImpact: true })).toBe(true);
    expect(requiresHumanReview({ autonomyDecision: "allow", confidence: 0.4, highImpact: false })).toBe(true);
  });
});
