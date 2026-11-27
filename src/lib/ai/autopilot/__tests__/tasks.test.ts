import { describe, expect, it } from "vitest";

import { backoffMs, isClaimable, isDead, onAttemptFailed, orderQueue } from "@/lib/ai/autopilot/tasks";

describe("backoffMs", () => {
  it("is exponential and capped", () => {
    expect(backoffMs(1, 1000)).toBe(1000);
    expect(backoffMs(2, 1000)).toBe(2000);
    expect(backoffMs(3, 1000)).toBe(4000);
    expect(backoffMs(99, 1000)).toBe(6 * 60 * 60_000); // cap
  });
});

describe("isDead", () => {
  it("dead-letters once attempts are exhausted", () => {
    expect(isDead(2, 3)).toBe(false);
    expect(isDead(3, 3)).toBe(true);
    expect(isDead(4, 3)).toBe(true);
  });
});

describe("isClaimable", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("claims a queued task whose time has come", () => {
    expect(isClaimable({ status: "queued", runAfter: "2026-01-01T11:59:00Z", lockedAt: null }, now)).toBe(true);
  });
  it("skips a future task", () => {
    expect(isClaimable({ status: "queued", runAfter: "2026-01-01T12:05:00Z", lockedAt: null }, now)).toBe(false);
  });
  it("skips done/dead/failed", () => {
    expect(isClaimable({ status: "done", runAfter: "2026-01-01T11:00:00Z", lockedAt: null }, now)).toBe(false);
    expect(isClaimable({ status: "dead", runAfter: "2026-01-01T11:00:00Z", lockedAt: null }, now)).toBe(false);
  });
  it("reclaims a running task with a stale lock, not a fresh one", () => {
    expect(isClaimable({ status: "running", runAfter: "2026-01-01T11:00:00Z", lockedAt: "2026-01-01T11:00:00Z" }, now)).toBe(true); // 60m old
    expect(isClaimable({ status: "running", runAfter: "2026-01-01T11:00:00Z", lockedAt: "2026-01-01T11:59:30Z" }, now)).toBe(false); // 30s old
  });
});

describe("orderQueue", () => {
  it("orders by priority desc, then run_after asc", () => {
    const ordered = orderQueue([
      { priority: 10, runAfter: "2026-01-01T10:00:00Z" },
      { priority: 90, runAfter: "2026-01-01T11:00:00Z" },
      { priority: 90, runAfter: "2026-01-01T10:30:00Z" },
    ]);
    expect(ordered.map((t) => t.priority)).toEqual([90, 90, 10]);
    expect(ordered[0].runAfter).toBe("2026-01-01T10:30:00Z");
  });
});

describe("onAttemptFailed", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("reschedules with backoff while attempts remain", () => {
    const r = onAttemptFailed({ attempts: 0, maxAttempts: 3 }, now, 1000);
    expect(r.status).toBe("queued");
    expect(r.attempts).toBe(1);
    expect(r.runAfter).toBe(new Date(now.getTime() + 1000).toISOString());
    expect(r.lockedAt).toBeNull();
  });
  it("dead-letters when attempts are exhausted", () => {
    const r = onAttemptFailed({ attempts: 2, maxAttempts: 3 }, now, 1000);
    expect(r.status).toBe("dead");
    expect(r.attempts).toBe(3);
  });
});
