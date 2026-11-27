import type { UnsubscribeStatus } from "@/lib/database.types";

/**
 * Pure helpers for reacting to an inbound customer email: detect an unsubscribe
 * request, and compute the lead update that stops the autopilot follow-up
 * sequence. No I/O here so the rules are easy to test and reason about.
 *
 * Product rule: when a customer replies to a lead, WinBack stops chasing them —
 * an unsubscribe marks the lead unsubscribed (never contacted again), any other
 * reply pauses the autopilot (a human takes over). Both clear the next
 * scheduled follow-up so the cron will not draft another message.
 */

/** Phrases that signal the customer wants out. Conservative to avoid false positives. */
const UNSUBSCRIBE_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bopt[\s-]?out\b/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\b(do not|don'?t) (contact|email|message|text) me\b/i,
  /\bno more (emails|messages)\b/i,
  /\bstop (emailing|messaging|contacting)\b/i,
];

export function isUnsubscribeRequest(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  // A bare "stop" (common one-word opt-out) counts; "stop by tomorrow" does not.
  if (/^stop[.!]?$/i.test(t)) return true;
  return UNSUBSCRIBE_PATTERNS.some((re) => re.test(t));
}

export type LeadReplyUpdate = {
  next_follow_up_at: null;
  autopilot_paused?: boolean;
  unsubscribe_status?: UnsubscribeStatus;
};

/**
 * The lead fields to update when an inbound reply is associated with a lead.
 * Unsubscribe wins (hard stop); otherwise pause the autopilot. Always clears the
 * scheduled follow-up so no further draft is generated.
 */
export function leadUpdateForInboundReply(opts: { unsubscribe: boolean }): LeadReplyUpdate {
  if (opts.unsubscribe) {
    return { unsubscribe_status: "unsubscribed", next_follow_up_at: null };
  }
  return { autopilot_paused: true, next_follow_up_at: null };
}

/** Human-readable reason for the activity/audit log. */
export function inboundReplyReason(opts: { unsubscribe: boolean }): string {
  return opts.unsubscribe ? "customer_unsubscribed" : "customer_replied";
}
