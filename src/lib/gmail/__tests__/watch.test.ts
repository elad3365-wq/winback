import { describe, expect, it } from "vitest";

import { needsRenewal } from "@/lib/gmail/watch";

describe("needsRenewal", () => {
  const now = new Date("2026-01-10T00:00:00.000Z");

  it("renews when there is no watch or the timestamp is unparsable", () => {
    expect(needsRenewal(null, now)).toBe(true);
    expect(needsRenewal("not-a-date", now)).toBe(true);
  });

  it("renews when the watch is within the renewal window (default 2 days)", () => {
    const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(needsRenewal(inOneDay, now)).toBe(true);
  });

  it("does not renew a watch with comfortable runway", () => {
    const inSixDays = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsRenewal(inSixDays, now)).toBe(false);
  });

  it("treats an already-expired watch as needing renewal", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(needsRenewal(yesterday, now)).toBe(true);
  });

  it("honours a custom threshold", () => {
    const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsRenewal(inThreeDays, now, 1 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(needsRenewal(inThreeDays, now, 4 * 24 * 60 * 60 * 1000)).toBe(true);
  });
});
