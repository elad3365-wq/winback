import { describe, expect, it } from "vitest";

import { estimateDraftCostUsd, remainingActions, withinActionLimit, withinSpendLimit } from "@/lib/ai/autopilot/limits";

describe("action limit", () => {
  it("allows until the daily cap is hit", () => {
    expect(withinActionLimit(0, 5)).toBe(true);
    expect(withinActionLimit(4, 5)).toBe(true);
    expect(withinActionLimit(5, 5)).toBe(false);
    expect(withinActionLimit(0, 0)).toBe(false); // 0 = paused
  });
  it("reports remaining", () => {
    expect(remainingActions(3, 5)).toBe(2);
    expect(remainingActions(9, 5)).toBe(0);
  });
});

describe("spend estimate + limit", () => {
  it("orders cost by model (haiku < sonnet < opus)", () => {
    expect(estimateDraftCostUsd("claude-haiku-5-5")).toBeLessThan(estimateDraftCostUsd("claude-sonnet-5-5"));
    expect(estimateDraftCostUsd("claude-sonnet-5-5")).toBeLessThan(estimateDraftCostUsd("claude-opus-5-5"));
  });
  it("blocks when the next draft would exceed the cap", () => {
    expect(withinSpendLimit(0, 0.004, 5)).toBe(true);
    expect(withinSpendLimit(4.999, 0.004, 5)).toBe(false);
    expect(withinSpendLimit(0, 0.004, 0)).toBe(false); // 0 = paused
  });
});
