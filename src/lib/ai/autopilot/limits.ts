/**
 * Per-business rate + AI-spend limits (Phase 3) — pure checks the engine applies
 * before it spends money on a model call. The counts/spend are supplied by the
 * caller (queried from the audit log); this module just enforces the policy.
 */

import type { FollowupModel } from "@/lib/ai/models";

/** Allowed to take another action today? A limit of 0 means "paused" (no actions). */
export function withinActionLimit(countToday: number, dailyLimit: number): boolean {
  return countToday < dailyLimit;
}

export function remainingActions(countToday: number, dailyLimit: number): number {
  return Math.max(0, dailyLimit - countToday);
}

/**
 * Rough USD cost of one short, human-reviewed draft per model (≈500 input +
 * 300 output tokens), from first-party per-MTok rates. Used only to enforce a
 * soft daily spend cap; real usage is reconciled from provider billing.
 */
export function estimateDraftCostUsd(model: FollowupModel): number {
  const IN = 500 / 1_000_000;
  const OUT = 300 / 1_000_000;
  switch (model) {
    case "claude-haiku-5-5":
      return IN * 0.1 + OUT * 0.5; // ≈ $0.0002
    case "claude-opus-5-5":
      return IN * 4 + OUT * 20; // ≈ $0.008
    case "claude-sonnet-5-5":
    default:
      return IN * 2 + OUT * 10; // ≈ $0.004
  }
}

/** Would one more draft (estimated `estimatedCostUsd`) stay within today's cap? */
export function withinSpendLimit(spentTodayUsd: number, estimatedCostUsd: number, dailyLimitUsd: number): boolean {
  if (dailyLimitUsd <= 0) return false; // 0 = paused
  return spentTodayUsd + estimatedCostUsd <= dailyLimitUsd;
}
