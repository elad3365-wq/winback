/**
 * Pure decision logic for AUTONOMOUS email sending. No I/O — the execution
 * engine feeds it the facts and acts on the verdict, so every guardrail here is
 * unit-testable. Fail-closed: anything uncertain routes to a human draft.
 *
 * A reply is sent automatically ONLY when every condition holds:
 *   - the environment allows real sending (WINBACK_GMAIL_ALLOW_SEND),
 *   - the business is at AUTOPILOT autonomy AND the owner authorized sending,
 *   - the recipient hasn't unsubscribed,
 *   - the sender is a real person (not a no-reply / mailer-daemon / list),
 *   - the inbound isn't sensitive (refund, legal, complaint, dispute, …),
 *   - the draft passed the supervisor's outbound validation, and
 *   - the draft actually answers (it doesn't punt to "a team member").
 * Otherwise the reply is kept as a draft for owner approval (DRAFT behaviour).
 */

/** Inbound topics that must always go to a human, never an automatic reply. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\brefund(s|ed|ing)?\b/i,
  /\bchargeback\b/i,
  /\bcancel(l?ed|l?ing|lation)?\b/i,
  /\b(lawyer|attorney|legal|lawsuit|sue|suing|litigation|court)\b/i,
  /\b(complaint|complain(ing|ed)?)\b/i,
  /\bdispute(d|s)?\b/i,
  /\b(better business bureau|\bbbb\b)\b/i,
  /\b(injur(y|ed|ies)|damage(s|d)? claim|property damage)\b/i,
  /\bwarranty claim\b/i,
  /\b(fraud|scam|rip[\s-]?off)\b/i,
  /\b(unacceptable|outraged?|furious|disgusted)\b/i,
  /\b(insurance claim|liabilit(y|ies))\b/i,
];

export function isSensitiveInbound(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(t));
}

/** Senders we must never auto-reply to (prevents mail loops and list spam). */
const AUTOMATED_SENDER: RegExp =
  /(^|[._-])(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounce|notifications?|newsletter|donotreply)(@|[._-])/i;

export function isAutomatedSender(fromAddress: string | null | undefined): boolean {
  const a = (fromAddress ?? "").trim().toLowerCase();
  if (!a) return true; // no reply-to address → cannot safely auto-send
  return AUTOMATED_SENDER.test(a);
}

/**
 * The drafter is instructed to say a team member will follow up when it lacks
 * the facts to answer. Such a draft is a non-answer — never auto-send it; a
 * human should take the thread. Conservative so it only catches the punt phrase.
 */
const DEFERS_TO_HUMAN: RegExp[] = [
  /\bteam member will (follow up|reach out|be in touch|get back|contact)\b/i,
  /\b(we'?ll|we will|someone will|a colleague will) (follow up|reach out|be in touch|get back to you)\b/i,
  /\bget back to you (with|on) (the )?(specific|detail|exact)/i,
];

export function replyDefersToHuman(body: string | null | undefined): boolean {
  const t = (body ?? "").trim();
  if (!t) return true;
  return DEFERS_TO_HUMAN.some((re) => re.test(t));
}

export type AutoSendInputs = {
  globalSendEnabled: boolean; // WINBACK_GMAIL_ALLOW_SEND === "true"
  autopilot: boolean; // autonomy level === "autopilot"
  ownerAuthorizedSending: boolean; // per-business explicit opt-in
  emergencyStop: boolean;
  recipientUnsubscribed: boolean;
  automatedSender: boolean;
  sensitive: boolean;
  draftValid: boolean; // supervisor.validateOutboundDraft passed
  defersToHuman: boolean; // the draft punts instead of answering
};

export type AutoSendDecision = { send: boolean; reason: string };

export function decideAutoSend(i: AutoSendInputs): AutoSendDecision {
  if (!i.globalSendEnabled) return { send: false, reason: "sending_disabled_globally" };
  if (i.emergencyStop) return { send: false, reason: "emergency_stop" };
  if (!i.autopilot) return { send: false, reason: "not_autopilot" };
  if (!i.ownerAuthorizedSending) return { send: false, reason: "owner_has_not_authorized_sending" };
  if (i.recipientUnsubscribed) return { send: false, reason: "recipient_unsubscribed" };
  if (i.automatedSender) return { send: false, reason: "automated_or_missing_sender" };
  if (i.sensitive) return { send: false, reason: "sensitive_topic_routed_to_human" };
  if (!i.draftValid) return { send: false, reason: "draft_failed_validation" };
  if (i.defersToHuman) return { send: false, reason: "draft_defers_to_human" };
  return { send: true, reason: "authorized_autopilot_send" };
}
