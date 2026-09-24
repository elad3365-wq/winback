"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import { isAiTone, isAutopilotMode, type AutopilotSettings } from "@/lib/autopilot";
import { createClient } from "@/lib/supabase/server";

export type AutopilotSettingsResult =
  | { status: "success" }
  | { status: "error"; error: string };

function clampMinutes(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  // Cap at ~30 days so a typo can't schedule a follow-up years out.
  return Math.min(Math.round(value), 43200);
}

export async function updateAutopilotSettingsAction(
  input: AutopilotSettings,
): Promise<AutopilotSettingsResult> {
  if (!isAutopilotMode(input.autopilot_mode)) {
    return { status: "error", error: "Pick a valid autopilot mode." };
  }
  if (!isAiTone(input.tone)) {
    return { status: "error", error: "Pick a valid tone." };
  }

  const maximumFollowups = Number(input.maximum_followups);
  if (!Number.isInteger(maximumFollowups) || maximumFollowups < 0 || maximumFollowups > 10) {
    return { status: "error", error: "Maximum follow-ups must be between 0 and 10." };
  }

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { error } = await supabase.from("business_ai_settings").upsert(
    {
      business_id: business.id,
      autopilot_enabled: Boolean(input.autopilot_enabled),
      autopilot_mode: input.autopilot_mode,
      first_followup_delay_minutes: clampMinutes(Number(input.first_followup_delay_minutes)),
      second_followup_delay_minutes: clampMinutes(Number(input.second_followup_delay_minutes)),
      third_followup_delay_minutes: clampMinutes(Number(input.third_followup_delay_minutes)),
      maximum_followups: maximumFollowups,
      approval_required_for_discounts: Boolean(input.approval_required_for_discounts),
      approval_required_for_custom_answers: Boolean(input.approval_required_for_custom_answers),
      tone: input.tone,
    },
    { onConflict: "business_id" },
  );

  if (error) {
    return { status: "error", error: error.message };
  }

  revalidatePath("/settings/ai");
  return { status: "success" };
}
