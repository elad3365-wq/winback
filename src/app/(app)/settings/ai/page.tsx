import { AutopilotSettingsForm } from "@/components/settings/autopilot-settings-form";
import { requireBusinessContext } from "@/lib/business";
import { DEFAULT_AUTOPILOT_SETTINGS, type AutopilotSettings } from "@/lib/autopilot";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "AI Autopilot · WinBack",
};

export default async function AiSettingsPage() {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: ai } = await supabase
    .from("business_ai_settings")
    .select(
      "autopilot_enabled, autopilot_mode, first_followup_delay_minutes, second_followup_delay_minutes, third_followup_delay_minutes, maximum_followups, approval_required_for_discounts, approval_required_for_custom_answers, tone",
    )
    .eq("business_id", business.id)
    .maybeSingle();

  const initial: AutopilotSettings = {
    autopilot_enabled: ai?.autopilot_enabled ?? DEFAULT_AUTOPILOT_SETTINGS.autopilot_enabled,
    autopilot_mode: ai?.autopilot_mode ?? DEFAULT_AUTOPILOT_SETTINGS.autopilot_mode,
    first_followup_delay_minutes:
      ai?.first_followup_delay_minutes ?? DEFAULT_AUTOPILOT_SETTINGS.first_followup_delay_minutes,
    second_followup_delay_minutes:
      ai?.second_followup_delay_minutes ?? DEFAULT_AUTOPILOT_SETTINGS.second_followup_delay_minutes,
    third_followup_delay_minutes:
      ai?.third_followup_delay_minutes ?? DEFAULT_AUTOPILOT_SETTINGS.third_followup_delay_minutes,
    maximum_followups: ai?.maximum_followups ?? DEFAULT_AUTOPILOT_SETTINGS.maximum_followups,
    approval_required_for_discounts:
      ai?.approval_required_for_discounts ??
      DEFAULT_AUTOPILOT_SETTINGS.approval_required_for_discounts,
    approval_required_for_custom_answers:
      ai?.approval_required_for_custom_answers ??
      DEFAULT_AUTOPILOT_SETTINGS.approval_required_for_custom_answers,
    tone: ai?.tone ?? DEFAULT_AUTOPILOT_SETTINGS.tone,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Autopilot</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure how WinBack drafts follow-ups. Sending stays off — autopilot only prepares
          drafts for your approval.
        </p>
      </header>

      <AutopilotSettingsForm initial={initial} />
    </div>
  );
}
