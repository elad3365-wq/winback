/**
 * AI CRM Agent core (Phase 2 agent #3) — pure, evidence-based lead-stage updates
 * from an inbound customer reply. Conservative: only advances a lead forward
 * (never downgrades a won/lost/engaged lead), and a reply always pauses the
 * autopilot follow-up sequence (the customer is engaging; a human takes over).
 */

import type { BuyingIntent } from "@/lib/ai/autopilot/scoring";
import type { LeadStatus } from "@/lib/database.types";

/** Statuses the auto-updater must never overwrite (owner-owned or terminal). */
const LOCKED: LeadStatus[] = [
  "recovered",
  "lost",
  "unsubscribed",
  "paused",
  "interested",
  "call_requested",
];

export type CrmUpdate = {
  status?: LeadStatus;
  /** A reply pauses the scheduled follow-up sequence. */
  next_follow_up_at?: string | null;
};

/**
 * The CRM change to apply when a customer reply comes in. Clears the next
 * scheduled follow-up (they replied), and nudges an early-stage lead forward
 * based on detected intent — never past a locked status.
 */
export function crmUpdateForInbound(opts: { intent: BuyingIntent; currentStatus: LeadStatus }): CrmUpdate {
  const update: CrmUpdate = { next_follow_up_at: null };
  if (LOCKED.includes(opts.currentStatus)) return update;

  if (opts.intent === "high") {
    update.status = "interested";
  } else if (opts.currentStatus === "new" && (opts.intent === "medium" || opts.intent === "low")) {
    update.status = "contacted";
  }
  return update;
}
