/**
 * AI Retention Agent core (Phase 2 agent #5) — pure churn/inactivity detection
 * and a cadence cap that prevents excessive or repetitive messaging. Operates on
 * the lead timing data WinBack already tracks.
 */

import type { LeadStatus } from "@/lib/database.types";

export type ChurnRisk = "low" | "medium" | "high";

/** Closed/stopped statuses that the retention agent must not re-engage. */
const DO_NOT_REENGAGE: LeadStatus[] = ["recovered", "lost", "unsubscribed", "paused"];

/**
 * Churn risk from inactivity. Longer silence on an open lead = higher risk.
 * Closed/opted-out leads are always "low" (not a churn target).
 */
export function churnRisk(lead: { status: LeadStatus; daysSinceLastContact: number }): ChurnRisk {
  if (DO_NOT_REENGAGE.includes(lead.status)) return "low";
  const d = Math.max(0, lead.daysSinceLastContact || 0);
  if (d >= 30) return "high";
  if (d >= 14) return "medium";
  return "low";
}

export type ReengageContext = {
  status: LeadStatus;
  unsubscribed: boolean;
  followUpCount: number;
  maxFollowups: number;
  daysSinceLastContact: number;
  /** Minimum days between re-engagement touches, to avoid spamming. */
  minGapDays?: number;
};

export type ReengageDecision = { allowed: boolean; reason: string };

/**
 * Whether the retention agent may send another win-back touch. Fail-closed:
 * respects unsubscribe, the per-business follow-up cap, closed statuses, and a
 * minimum gap between touches so customers are never over-messaged.
 */
export function canReengage(ctx: ReengageContext): ReengageDecision {
  if (ctx.unsubscribed || ctx.status === "unsubscribed") {
    return { allowed: false, reason: "Customer has unsubscribed." };
  }
  if (DO_NOT_REENGAGE.includes(ctx.status)) {
    return { allowed: false, reason: `Lead is ${ctx.status}; not a re-engagement target.` };
  }
  if (ctx.followUpCount >= ctx.maxFollowups) {
    return { allowed: false, reason: "Reached the maximum number of follow-ups." };
  }
  const minGap = ctx.minGapDays ?? 3;
  if (ctx.daysSinceLastContact < minGap) {
    return { allowed: false, reason: `Last contact was too recent (< ${minGap} days).` };
  }
  return { allowed: true, reason: "Eligible for a re-engagement touch." };
}
