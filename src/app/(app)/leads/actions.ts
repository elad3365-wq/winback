"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import { logActivity } from "@/lib/activity";
import { friendlyLeadError, LEAD_NOT_FOUND, parseLeadInput } from "@/lib/lead-input";
import { AUTOPILOT_STOP_STATUSES, isLeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import type { LeadFormState } from "./form-state";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidate() {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function createLeadAction(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = parseLeadInput(formData);
  if ("error" in parsed) {
    return { status: "error", error: parsed.error };
  }

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  // If autopilot is on and the lead is in a follow-up-able state, schedule the
  // first follow-up. The scheduler (a draft-only cron) picks it up when due.
  const { data: settings } = await supabase
    .from("business_ai_settings")
    .select("autopilot_enabled, first_followup_delay_minutes")
    .eq("business_id", business.id)
    .maybeSingle();

  const eligible =
    !AUTOPILOT_STOP_STATUSES.includes(parsed.status) && parsed.status !== "cold";
  const nextFollowUpAt =
    settings?.autopilot_enabled && eligible
      ? new Date(
          Date.now() + (settings.first_followup_delay_minutes ?? 60) * 60_000,
        ).toISOString()
      : null;

  const { data: created, error } = await supabase
    .from("leads")
    .insert({
      ...parsed,
      business_id: business.id,
      created_by: user.id,
      next_follow_up_at: nextFollowUpAt,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("createLeadAction failed", error);
    return { status: "error", error: friendlyLeadError(error) };
  }

  await logActivity({
    businessId: business.id,
    leadId: created.id,
    userId: user.id,
    type: "lead_created",
    metadata: { status: parsed.status },
  });

  revalidate();
  return { status: "success", submittedAt: Date.now() };
}

export async function updateLeadAction(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const leadId = readString(formData, "id");
  if (!leadId) {
    return { status: "error", error: "Missing lead id." };
  }

  const parsed = parseLeadInput(formData);
  if ("error" in parsed) {
    return { status: "error", error: parsed.error };
  }

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!before) return { status: "error", error: LEAD_NOT_FOUND };

  // RLS turns a blocked UPDATE into "0 rows, no error", so ask for the row
  // back and treat an empty result as a failure rather than a silent success.
  const { data: updated, error } = await supabase
    .from("leads")
    .update(parsed)
    .eq("id", leadId)
    .eq("business_id", business.id)
    .select("id");

  if (error) {
    console.error("updateLeadAction failed", error);
    return { status: "error", error: friendlyLeadError(error) };
  }
  if (!updated || updated.length === 0) return { status: "error", error: LEAD_NOT_FOUND };

  if (before.status !== parsed.status) {
    await logActivity({
      businessId: business.id,
      leadId,
      userId: user.id,
      type: "status_changed",
      metadata: { from: before.status, to: parsed.status },
    });
  }

  revalidate();
  revalidatePath(`/leads/${leadId}`);
  return { status: "success", submittedAt: Date.now() };
}

export async function updateLeadStatusAction(leadId: string, status: string) {
  if (!isLeadStatus(status)) {
    return { error: "Unknown status." };
  }

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!before) return { error: LEAD_NOT_FOUND };

  const { data: updated, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("business_id", business.id)
    .select("id");

  if (error) {
    console.error("updateLeadStatusAction failed", error);
    return { error: friendlyLeadError(error) };
  }
  if (!updated || updated.length === 0) return { error: LEAD_NOT_FOUND };

  if (before.status !== status) {
    await logActivity({
      businessId: business.id,
      leadId,
      userId: user.id,
      type: "status_changed",
      metadata: { from: before.status, to: status },
    });
  }

  revalidate();
  revalidatePath(`/leads/${leadId}`);
  return { error: undefined };
}

export async function deleteLeadAction(leadId: string) {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("business_id", business.id)
    .select("id");

  if (error) {
    console.error("deleteLeadAction failed", error);
    return { error: friendlyLeadError(error) };
  }
  if (!deleted || deleted.length === 0) return { error: LEAD_NOT_FOUND };

  revalidate();
  return { error: undefined };
}
