/**
 * One place that decides whether WinBack may spend money on an AI draft for a
 * business right now. Pure (the caller supplies the autonomy row and today's
 * draft count) so both entry points — the owner's "Generate" button and the
 * daily follow-up cron — apply exactly the same rules, and they are unit-tested.
 *
 *  - AI level "off"      → nothing is generated (manual or automatic).
 *  - Emergency stop      → automatic drafting halts. A human clicking Generate is
 *                          not an automated action, so manual drafts still work
 *                          (they are always reviewed before anything is sent).
 *  - Daily action limit  → caps automatic drafts per business per UTC day.
 *  - Daily spend limit   → caps estimated AI spend per business per UTC day,
 *                          counting manual + automatic drafts.
 */

import { DEFAULT_AUTONOMY_LEVEL, isAutonomyLevel, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";
import { estimateDraftCostUsd, withinActionLimit, withinSpendLimit } from "@/lib/ai/autopilot/limits";
import type { FollowupModel } from "@/lib/ai/models";

export type AutonomyRow = {
  level?: string | null;
  emergency_stop?: boolean | null;
  daily_action_limit?: number | null;
  daily_spend_limit_usd?: number | string | null;
} | null;

export type AiPolicy = {
  level: AutonomyLevel;
  emergencyStop: boolean;
  dailyActionLimit: number;
  dailySpendLimitUsd: number;
};

/** Defaults mirror the column defaults in 0012_ai_autopilot.sql. */
export function resolveAiPolicy(row: AutonomyRow): AiPolicy {
  const spend = Number(row?.daily_spend_limit_usd);
  const actions = Number(row?.daily_action_limit);
  return {
    level: isAutonomyLevel(row?.level) ? row.level : DEFAULT_AUTONOMY_LEVEL,
    emergencyStop: Boolean(row?.emergency_stop),
    dailyActionLimit: Number.isFinite(actions) && row?.daily_action_limit != null ? actions : 200,
    dailySpendLimitUsd: Number.isFinite(spend) && row?.daily_spend_limit_usd != null ? spend : 5,
  };
}

export type DraftGuardReason = "ai_off" | "emergency_stop" | "action_limit" | "spend_limit";

export type DraftGuardResult = { ok: true } | { ok: false; reason: DraftGuardReason; message: string };

export const DRAFT_GUARD_MESSAGES: Record<DraftGuardReason, string> = {
  ai_off: "AI is turned off for this business. Turn it back on under AI Control.",
  emergency_stop: "Emergency stop is active — automatic drafting is paused.",
  action_limit: "This business reached today's limit of automatic AI drafts.",
  spend_limit: "This business reached today's AI spending limit. It resets at midnight UTC, or raise it under AI Control.",
};

export function canGenerateDraft(input: {
  policy: AiPolicy;
  trigger: "manual" | "automatic";
  /** Drafts already generated today for this business (all sources). */
  draftsToday: number;
  /** Automatic drafts already generated today (for the action limit). */
  automaticDraftsToday?: number;
  model: FollowupModel;
}): DraftGuardResult {
  const { policy, trigger, draftsToday, model } = input;
  const deny = (reason: DraftGuardReason): DraftGuardResult => ({
    ok: false,
    reason,
    message: DRAFT_GUARD_MESSAGES[reason],
  });

  if (policy.level === "off") return deny("ai_off");
  if (trigger === "automatic" && policy.emergencyStop) return deny("emergency_stop");
  if (
    trigger === "automatic" &&
    !withinActionLimit(input.automaticDraftsToday ?? draftsToday, policy.dailyActionLimit)
  ) {
    return deny("action_limit");
  }
  const cost = estimateDraftCostUsd(model);
  if (!withinSpendLimit(Math.max(0, draftsToday) * cost, cost, policy.dailySpendLimitUsd)) {
    return deny("spend_limit");
  }
  return { ok: true };
}

/** Start of the current UTC day, ISO — the window the daily limits use. */
export function utcDayStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
