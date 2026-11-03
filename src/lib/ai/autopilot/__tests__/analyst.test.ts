import { describe, expect, it } from "vitest";

import { aiPerformance, averageResponseMinutes, buildSummary, funnelMetrics } from "@/lib/ai/autopilot/analyst";

describe("funnelMetrics", () => {
  it("counts stages and computes rates + recovered revenue", () => {
    const m = funnelMetrics([
      { status: "new", estimateAmount: 1000 },
      { status: "contacted", estimateAmount: 2000 },
      { status: "interested", estimateAmount: 3000 },
      { status: "recovered", estimateAmount: 4000 },
      { status: "lost", estimateAmount: 5000 },
    ]);
    expect(m.total).toBe(5);
    expect(m.recovered).toBe(1);
    expect(m.lost).toBe(1);
    expect(m.recoveredRevenue).toBe(4000);
    expect(m.recoveryRate).toBeCloseTo(0.2, 5);
    expect(m.interested).toBe(1);
    // contacted+ includes contacted, interested, recovered, lost (not "new")
    expect(m.contacted).toBe(4);
  });

  it("handles an empty funnel without dividing by zero", () => {
    const m = funnelMetrics([]);
    expect(m.total).toBe(0);
    expect(m.contactRate).toBe(0);
    expect(m.recoveryRate).toBe(0);
  });
});

describe("aiPerformance", () => {
  it("computes approval and send rates", () => {
    const p = aiPerformance({ drafted: 10, approved: 6, sent: 3, discarded: 2 });
    expect(p.approvalRate).toBeCloseTo(0.6, 5);
    expect(p.sendRate).toBeCloseTo(0.5, 5);
  });
  it("is safe with zero drafts", () => {
    expect(aiPerformance({ drafted: 0, approved: 0, sent: 0, discarded: 0 }).approvalRate).toBe(0);
  });
});

describe("averageResponseMinutes", () => {
  it("averages valid pairs and ignores invalid ones", () => {
    const base = Date.UTC(2026, 0, 1, 12, 0, 0);
    const avg = averageResponseMinutes([
      { inboundAt: base, respondedAt: base + 10 * 60_000 }, // 10 min
      { inboundAt: base, respondedAt: base + 20 * 60_000 }, // 20 min
      { inboundAt: base, respondedAt: base - 5 * 60_000 }, // invalid (responded before)
    ]);
    expect(avg).toBe(15);
  });
  it("returns null when there are no valid pairs", () => {
    expect(averageResponseMinutes([])).toBeNull();
  });
});

describe("buildSummary", () => {
  it("assembles a structured summary with highlights", () => {
    const funnel = funnelMetrics([
      { status: "recovered", estimateAmount: 4000 },
      { status: "new", estimateAmount: 1000 },
    ]);
    const ai = aiPerformance({ drafted: 4, approved: 2, sent: 1, discarded: 1 });
    const s = buildSummary("daily", funnel, ai, 12.5);
    expect(s.period).toBe("daily");
    expect(s.avgResponseMinutes).toBe(12.5);
    expect(s.highlights.length).toBeGreaterThan(0);
    expect(s.highlights.some((h) => h.includes("recovered"))).toBe(true);
  });
});
