import type { AiTone, AutopilotMode } from "@/lib/database.types";

/**
 * Per-business AI Autopilot configuration: the shape the settings form edits and
 * the scheduler reads. Sending is not implemented, so even "full" mode only
 * produces drafts awaiting approval for now.
 */
export type AutopilotSettings = {
  autopilot_enabled: boolean;
  autopilot_mode: AutopilotMode;
  first_followup_delay_minutes: number;
  second_followup_delay_minutes: number;
  third_followup_delay_minutes: number;
  maximum_followups: number;
  approval_required_for_discounts: boolean;
  approval_required_for_custom_answers: boolean;
  tone: AiTone;
};

export const AUTOPILOT_MODES: AutopilotMode[] = ["manual", "assisted", "full"];

export const AUTOPILOT_MODE_LABELS: Record<AutopilotMode, string> = {
  manual: "Manual — you generate and approve every message yourself",
  assisted: "Assisted — autopilot drafts follow-ups for you to approve",
  full: "Full — autopilot drafts on schedule (sending still requires approval for now)",
};

export const AI_TONES: AiTone[] = ["professional", "friendly", "direct", "premium"];

export const AI_TONE_LABELS: Record<AiTone, string> = {
  professional: "Professional",
  friendly: "Friendly",
  direct: "Direct",
  premium: "Premium",
};

export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  autopilot_enabled: false,
  autopilot_mode: "manual",
  first_followup_delay_minutes: 60,
  second_followup_delay_minutes: 1440,
  third_followup_delay_minutes: 4320,
  maximum_followups: 3,
  approval_required_for_discounts: true,
  approval_required_for_custom_answers: true,
  tone: "professional",
};

export function isAutopilotMode(value: unknown): value is AutopilotMode {
  return typeof value === "string" && (AUTOPILOT_MODES as string[]).includes(value);
}

export function isAiTone(value: unknown): value is AiTone {
  return typeof value === "string" && (AI_TONES as string[]).includes(value);
}

/** The configured delay (in minutes) before follow-up number `n` (1-based). */
export function delayMinutesForFollowup(settings: AutopilotSettings, n: number): number {
  if (n <= 1) return settings.first_followup_delay_minutes;
  if (n === 2) return settings.second_followup_delay_minutes;
  return settings.third_followup_delay_minutes;
}
