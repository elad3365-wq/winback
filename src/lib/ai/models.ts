/**
 * Which Claude model the follow-up drafter uses, and how it is chosen.
 *
 * Pure and dependency-free (only reads an env var it is handed) so it can be
 * unit-tested without a network or the Anthropic SDK.
 *
 * Follow-ups are short, well-specified, human-reviewed messages, so the default
 * is a cost-efficient model rather than the most expensive one. The default can
 * be overridden per deployment with WINBACK_FOLLOWUP_MODEL; an unknown value is
 * ignored (falls back to the default) so a typo never sends an invalid model id
 * to the API.
 */

/**
 * Models allowed for follow-up drafting, cheapest → most capable. Kept to a
 * curated allowlist (current Claude generation) so the stored `ai_model` column
 * and the request model are always a known, valid id.
 *   claude-haiku-5-5   $0.10 / $0.50 per Mtok  — cheapest
 *   claude-sonnet-5-5  $2 / $10 per Mtok       — default: best balance
 *   claude-opus-5-5    $4 / $20 per Mtok       — most capable
 */
export const SUPPORTED_FOLLOWUP_MODELS = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
] as const;

export type FollowupModel = (typeof SUPPORTED_FOLLOWUP_MODELS)[number];

/** Cost-efficient, high-quality default for short customer follow-ups. */
export const DEFAULT_FOLLOWUP_MODEL: FollowupModel = "claude-sonnet-5-5";

export function isSupportedFollowupModel(value: unknown): value is FollowupModel {
  return typeof value === "string" && (SUPPORTED_FOLLOWUP_MODELS as readonly string[]).includes(value);
}

/**
 * The model to use for a follow-up draft. Reads WINBACK_FOLLOWUP_MODEL from the
 * given env (defaults to process.env); returns the configured model when it is
 * on the allowlist, otherwise the cost-efficient default.
 */
export function resolveFollowupModel(
  env: Record<string, string | undefined> = process.env,
): FollowupModel {
  const configured = env.WINBACK_FOLLOWUP_MODEL?.trim();
  return isSupportedFollowupModel(configured) ? configured : DEFAULT_FOLLOWUP_MODEL;
}
