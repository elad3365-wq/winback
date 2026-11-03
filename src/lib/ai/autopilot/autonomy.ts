/**
 * Autonomy policy for the WinBack AI Autopilot (Phase 5).
 *
 * Pure and dependency-free so the rules can be unit-tested and reused by the
 * orchestrator, the supervisor, and the execution layer. This is the single
 * place that decides, for a given action + a business's autonomy level + safety
 * flags, whether the AI may act on its own, must get owner approval first, or is
 * blocked outright. The execution layer MUST consult this before doing anything
 * outward-facing; it never trusts an agent's own say-so.
 */

/** OFF: AI disabled. ASSIST: analyze + suggest only. DRAFT: auto internal + drafts, approval before external. AUTOPILOT: execute authorized workflows within limits. */
export type AutonomyLevel = "off" | "assist" | "draft" | "autopilot";

export const AUTONOMY_LEVELS: AutonomyLevel[] = ["off", "assist", "draft", "autopilot"];

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  off: "Off — AI disabled",
  assist: "Assist — analyze and suggest only",
  draft: "Draft — auto internal actions + drafts, approval before sending",
  autopilot: "Autopilot — execute authorized workflows within limits",
};

/** Never silently upgrade: existing businesses default to DRAFT (or stricter). */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = "draft";

export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return typeof value === "string" && (AUTONOMY_LEVELS as string[]).includes(value);
}

/** Map the legacy per-business autopilot_mode to an autonomy level (stricter wins). */
export function autonomyFromLegacyMode(mode: string | null | undefined, enabled: boolean): AutonomyLevel {
  if (!enabled) return "off";
  if (mode === "assisted") return "assist";
  if (mode === "full") return "autopilot";
  return "draft"; // "manual" or unknown → safe default
}

/** The actions agents can take. High-impact ones always require a human. */
export type AgentAction =
  | "classify" // read/analyze a lead or message
  | "summarize"
  | "score_opportunity"
  | "update_crm" // change a lead stage / notes / activity
  | "create_task"
  | "schedule_followup"
  | "draft_followup" // create a draft (not sent)
  | "draft_reply"
  | "send_email" // outward communication
  | "send_sms"
  | "refund" // high-impact
  | "financial_commitment"
  | "data_deletion"
  | "resolve_dispute";

/** Actions that must ALWAYS be routed to the owner, regardless of autonomy level. */
export const HIGH_IMPACT_ACTIONS: ReadonlySet<AgentAction> = new Set<AgentAction>([
  "refund",
  "financial_commitment",
  "data_deletion",
  "resolve_dispute",
]);

/** Outward, customer-facing communication. */
export const EXTERNAL_ACTIONS: ReadonlySet<AgentAction> = new Set<AgentAction>(["send_email", "send_sms"]);

/** Read-only analysis is safe at any level except OFF / emergency stop. */
export const READ_ONLY_ACTIONS: ReadonlySet<AgentAction> = new Set<AgentAction>([
  "classify",
  "summarize",
  "score_opportunity",
]);

export type AutonomyDecision = "allow" | "needs_approval" | "blocked";

export type AutonomyContext = {
  level: AutonomyLevel;
  /** Global per-business kill switch — blocks every non-read action. */
  emergencyStop?: boolean;
  /** Whether real sending is enabled in this environment (WINBACK_GMAIL_ALLOW_SEND). */
  sendingEnabled?: boolean;
  /** Whether this specific outward workflow was explicitly authorized by the owner. */
  workflowAuthorized?: boolean;
};

export type AutonomyResult = { decision: AutonomyDecision; reason: string };

/**
 * Decide whether `action` may proceed. Order of precedence:
 *   1. OFF → everything blocked.
 *   2. Emergency stop → every non-read action blocked (analysis still allowed).
 *   3. High-impact action → always needs_approval (owner decides).
 *   4. External comms → blocked unless sending is enabled AND (autopilot + authorized);
 *      otherwise needs_approval (a draft the owner sends).
 *   5. Internal actions → by level: assist=needs_approval, draft/autopilot=allow.
 */
export function decideAutonomy(action: AgentAction, ctx: AutonomyContext): AutonomyResult {
  if (ctx.level === "off") return { decision: "blocked", reason: "AI is off for this business." };

  if (READ_ONLY_ACTIONS.has(action)) {
    // Analysis is always permitted while the AI is on (even under emergency stop,
    // since it changes nothing outward).
    return { decision: "allow", reason: "Read-only analysis." };
  }

  if (ctx.emergencyStop) {
    return { decision: "blocked", reason: "Emergency stop is active — all automated actions are halted." };
  }

  if (HIGH_IMPACT_ACTIONS.has(action)) {
    return { decision: "needs_approval", reason: `High-impact action (${action}) always requires owner approval.` };
  }

  if (EXTERNAL_ACTIONS.has(action)) {
    if (!ctx.sendingEnabled) {
      return { decision: "needs_approval", reason: "Sending is disabled; create a draft for owner approval." };
    }
    if (ctx.level === "autopilot" && ctx.workflowAuthorized) {
      return { decision: "allow", reason: "Autopilot: authorized outward workflow within limits." };
    }
    return { decision: "needs_approval", reason: "Outward communication requires owner approval at this level." };
  }

  // Internal CRM actions / drafts.
  if (ctx.level === "assist") {
    return { decision: "needs_approval", reason: "Assist level: suggestions require owner approval." };
  }
  return { decision: "allow", reason: `Internal action allowed at ${ctx.level} level.` };
}
