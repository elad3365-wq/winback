import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Hard AI spend control (migration 0014). Every model call reserves budget in
 * the database BEFORE it is made and records the real token usage afterwards.
 * The ledger (public.ai_usage) cannot be written, edited or deleted by users,
 * and the reserve function enforces a per-minute limit plus per-business,
 * per-owner and platform-wide daily caps, so deleting drafts, failing calls on
 * purpose, raising a business's own limit or opening more businesses no longer
 * buys extra AI spend.
 *
 * Fail closed: if the ledger is missing (migration not applied) or the call to
 * it fails, no model call is made.
 */

export type AiUsageSource = "manual_followup" | "autopilot_followup" | "manual_reply" | "autopilot_reply";

export type AiBudget = {
  /** RLS-bound client for a signed-in user, or the service-role client for background jobs. */
  db: SupabaseClient<Database>;
  businessId: string;
  source: AiUsageSource;
};

export type AiBudgetReason =
  | "per_minute"
  | "business_daily"
  | "owner_daily"
  | "platform_daily"
  | "not_allowed"
  | "unavailable";

export class AiBudgetError extends Error {
  constructor(public readonly reason: AiBudgetReason) {
    super(`AI budget: ${reason}`);
    this.name = "AiBudgetError";
  }
}

export const AI_BUDGET_MESSAGES: Record<AiBudgetReason, string> = {
  per_minute: "You're generating messages very quickly. Give it a minute and try again.",
  business_daily: "This business reached today's AI limit. It resets at midnight UTC.",
  owner_daily: "Your account reached today's AI limit. It resets at midnight UTC.",
  platform_daily: "AI drafting is paused for today. Please try again tomorrow.",
  not_allowed: "AI drafting isn't available for this business.",
  unavailable: "AI drafting is temporarily unavailable. Please try again.",
};

/** Map a database error from ai_reserve_call to a reason. Unknown → unavailable. */
export function budgetReasonFromError(message: string | null | undefined): AiBudgetReason {
  const match = /AI_BUDGET:([a-z_]+)/.exec(message ?? "");
  const reason = match?.[1];
  switch (reason) {
    case "per_minute":
    case "business_daily":
    case "owner_daily":
    case "platform_daily":
    case "not_allowed":
      return reason;
    default:
      return "unavailable";
  }
}

/** Reserve one call. Throws AiBudgetError when any cap is reached. */
export async function reserveAiCall(budget: AiBudget, model: string): Promise<string> {
  const { data, error } = await budget.db.rpc("ai_reserve_call", {
    p_business_id: budget.businessId,
    p_source: budget.source,
    p_model: model,
  });
  if (error || !data) {
    const reason = budgetReasonFromError(error?.message);
    if (reason === "unavailable") console.error("[ai/budget] reserve failed", error?.message ?? "no id");
    throw new AiBudgetError(reason);
  }
  return data;
}

/** Record the outcome. Best-effort: the reservation already counts against the caps. */
export async function finishAiCall(
  budget: AiBudget,
  usageId: string,
  outcome: { ok: boolean; inputTokens?: number; outputTokens?: number },
): Promise<void> {
  try {
    const { error } = await budget.db.rpc("ai_finish_call", {
      p_id: usageId,
      p_input_tokens: Math.max(0, Math.round(outcome.inputTokens ?? 0)),
      p_output_tokens: Math.max(0, Math.round(outcome.outputTokens ?? 0)),
      p_ok: outcome.ok,
    });
    if (error) console.error("[ai/budget] finish failed", error.message);
  } catch (error) {
    console.error("[ai/budget] finish failed", error instanceof Error ? error.message : error);
  }
}
