import { describe, expect, it } from "vitest";

import { isWithinBusinessHours } from "@/lib/ai/business-hours";

/** The scheduler's coarse business-hours gate. Fails OPEN (nothing is sent). */

// A fixed instant at 14:00 UTC and one at 03:00 UTC for deterministic checks.
const at = (hourUtc: number) => new Date(Date.UTC(2026, 0, 15, hourUtc, 0, 0));

describe("isWithinBusinessHours", () => {
  it("allows when no hours are configured", () => {
    expect(isWithinBusinessHours(null, at(3))).toBe(true);
    expect(isWithinBusinessHours("", at(3))).toBe(true);
  });

  it("fails open on unparseable text", () => {
    expect(isWithinBusinessHours("by appointment only", at(3))).toBe(true);
  });

  it("respects a same-day window", () => {
    expect(isWithinBusinessHours("9-17", at(14))).toBe(true); // 14:00 inside 9–17
    expect(isWithinBusinessHours("9-17", at(3))).toBe(false); // 03:00 outside
    expect(isWithinBusinessHours("9am - 5pm", at(16))).toBe(true);
    expect(isWithinBusinessHours("9am - 5pm", at(18))).toBe(false);
  });

  it("treats an overnight window as spanning midnight", () => {
    expect(isWithinBusinessHours("20:00 to 06:00", at(3))).toBe(true); // 03:00 inside overnight
    expect(isWithinBusinessHours("20:00 to 06:00", at(14))).toBe(false); // mid-afternoon outside
  });

  it("allows a degenerate window where start equals end", () => {
    expect(isWithinBusinessHours("9-9", at(3))).toBe(true);
  });
});
