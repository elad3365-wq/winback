/**
 * AI Sales Agent core (Phase 2 agent #2) — pure lead intent + opportunity
 * scoring. Deterministic heuristics over the data WinBack already has, so they
 * are testable and explainable; the LLM layer uses these as structured signals
 * and never invents prices, discounts, or commitments.
 */

import type { LeadStatus } from "@/lib/database.types";

export type BuyingIntent = "high" | "medium" | "low" | "none";

const HIGH_INTENT = [
  /\bready to (book|schedule|start|go ahead|proceed)\b/i,
  /\b(let'?s|lets) (do it|book|schedule|get started)\b/i,
  /\bsend (me )?(the )?(contract|invoice|quote|paperwork)\b/i,
  /\bwhen can you (start|come|begin)\b/i,
  /\bhow (soon|quickly) can\b/i,
  /\bsign me up\b/i,
];
const MEDIUM_INTENT = [
  /\bhow much\b/i,
  /\bprice|pricing|cost|quote|estimate\b/i,
  /\bavailab(le|ility)\b/i,
  /\bdo you (offer|do|handle)\b/i,
  /\bcan you\b/i,
  /\?\s*$/,
];
const NEGATIVE_INTENT = [
  /\bnot interested\b/i,
  /\bunsubscribe\b/i,
  /\bstop\b/i,
  /\bwent with (someone|another)\b/i,
  /\bno longer\b/i,
  /\btoo expensive\b/i,
];

/** Classify buying intent from the customer's own words. */
export function classifyIntent(text: string | null | undefined): BuyingIntent {
  const t = (text ?? "").trim();
  if (!t) return "none";
  if (NEGATIVE_INTENT.some((re) => re.test(t))) return "none";
  if (HIGH_INTENT.some((re) => re.test(t))) return "high";
  if (MEDIUM_INTENT.some((re) => re.test(t))) return "medium";
  return "low";
}

export type OpportunitySignals = {
  estimateAmount: number;
  status: LeadStatus;
  daysSinceLastContact: number;
  intent: BuyingIntent;
};

const INTENT_POINTS: Record<BuyingIntent, number> = { high: 45, medium: 25, low: 10, none: 0 };

/**
 * Score an opportunity 0–100: intent (0–45) + deal size (0–30) + recency
 * (0–15) + a stage nudge (0–10). Monotonic and bounded so it is easy to reason
 * about and test; it ranks opportunities, it does not promise outcomes.
 */
export function scoreOpportunity(s: OpportunitySignals): number {
  let score = INTENT_POINTS[s.intent];

  const amount = Math.max(0, s.estimateAmount || 0);
  score += Math.min(30, Math.round((amount / 10000) * 30)); // $10k+ saturates the size component

  const days = Math.max(0, s.daysSinceLastContact || 0);
  score += days <= 2 ? 15 : days <= 7 ? 10 : days <= 21 ? 5 : 0;

  if (s.status === "interested" || s.status === "call_requested") score += 10;
  else if (s.status === "new" || s.status === "contacted") score += 5;

  return Math.max(0, Math.min(100, score));
}

/** Statuses that are still in play for a sales follow-up. */
const OPEN_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "follow_up_needed",
  "followup_1",
  "followup_2",
  "followup_3",
  "interested",
];

/**
 * A stalled deal: still open, but gone quiet past `thresholdDays`. These are the
 * leads the Sales Agent recommends re-engaging.
 */
export function isStalledDeal(
  lead: { status: LeadStatus; daysSinceLastContact: number },
  thresholdDays = 5,
): boolean {
  return OPEN_STATUSES.includes(lead.status) && lead.daysSinceLastContact >= thresholdDays;
}
