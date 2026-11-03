import { describe, expect, it } from "vitest";

import { classifyIntent, isStalledDeal, scoreOpportunity } from "@/lib/ai/autopilot/scoring";

describe("classifyIntent", () => {
  it("detects high intent", () => {
    expect(classifyIntent("We're ready to schedule — when can you start?")).toBe("high");
    expect(classifyIntent("Send me the contract please")).toBe("high");
  });
  it("detects medium intent (questions / pricing)", () => {
    expect(classifyIntent("How much would this cost?")).toBe("medium");
    expect(classifyIntent("Are you available next week?")).toBe("medium");
  });
  it("detects negative / none", () => {
    expect(classifyIntent("Not interested, thanks")).toBe("none");
    expect(classifyIntent("please unsubscribe")).toBe("none");
    expect(classifyIntent("")).toBe("none");
  });
  it("falls back to low for neutral text", () => {
    expect(classifyIntent("Thanks for the info.")).toBe("low");
  });
});

describe("scoreOpportunity", () => {
  it("stays within 0..100", () => {
    const s = scoreOpportunity({ estimateAmount: 1_000_000, status: "interested", daysSinceLastContact: 0, intent: "high" });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
  it("rewards higher intent and recency", () => {
    const hi = scoreOpportunity({ estimateAmount: 5000, status: "contacted", daysSinceLastContact: 1, intent: "high" });
    const lo = scoreOpportunity({ estimateAmount: 5000, status: "contacted", daysSinceLastContact: 1, intent: "low" });
    expect(hi).toBeGreaterThan(lo);
    const fresh = scoreOpportunity({ estimateAmount: 5000, status: "contacted", daysSinceLastContact: 1, intent: "medium" });
    const stale = scoreOpportunity({ estimateAmount: 5000, status: "contacted", daysSinceLastContact: 60, intent: "medium" });
    expect(fresh).toBeGreaterThan(stale);
  });
});

describe("isStalledDeal", () => {
  it("flags open deals gone quiet, ignores closed ones", () => {
    expect(isStalledDeal({ status: "contacted", daysSinceLastContact: 7 })).toBe(true);
    expect(isStalledDeal({ status: "contacted", daysSinceLastContact: 1 })).toBe(false);
    expect(isStalledDeal({ status: "recovered", daysSinceLastContact: 30 })).toBe(false);
    expect(isStalledDeal({ status: "lost", daysSinceLastContact: 30 })).toBe(false);
  });
});
