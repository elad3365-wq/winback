import { describe, expect, it } from "vitest";

import { canReengage, churnRisk } from "@/lib/ai/autopilot/retention";

describe("churnRisk", () => {
  it("scales with inactivity for open leads", () => {
    expect(churnRisk({ status: "contacted", daysSinceLastContact: 5 })).toBe("low");
    expect(churnRisk({ status: "contacted", daysSinceLastContact: 20 })).toBe("medium");
    expect(churnRisk({ status: "contacted", daysSinceLastContact: 40 })).toBe("high");
  });
  it("never flags closed / opted-out leads", () => {
    expect(churnRisk({ status: "recovered", daysSinceLastContact: 90 })).toBe("low");
    expect(churnRisk({ status: "unsubscribed", daysSinceLastContact: 90 })).toBe("low");
  });
});

describe("canReengage", () => {
  const base = { status: "contacted" as const, unsubscribed: false, followUpCount: 1, maxFollowups: 3, daysSinceLastContact: 10 };
  it("allows an eligible, rested, under-cap lead", () => {
    expect(canReengage(base).allowed).toBe(true);
  });
  it("blocks unsubscribed", () => {
    expect(canReengage({ ...base, unsubscribed: true }).allowed).toBe(false);
  });
  it("blocks at the follow-up cap", () => {
    expect(canReengage({ ...base, followUpCount: 3 }).allowed).toBe(false);
  });
  it("blocks closed statuses", () => {
    expect(canReengage({ ...base, status: "lost" }).allowed).toBe(false);
  });
  it("blocks when contacted too recently (anti-spam gap)", () => {
    expect(canReengage({ ...base, daysSinceLastContact: 1 }).allowed).toBe(false);
  });
});
