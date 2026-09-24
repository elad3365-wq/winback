"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import type { LeadStatus } from "@/lib/database.types";
import { AUTOPILOT_STOP_STATUSES, isLeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

import type { LeadFormState } from "./form-state";

type ParsedLead = {
  customer_name: string;
  phone: string;
  service: string;
  estimate_amount: number;
  status: LeadStatus;
  follow_up_date: string | null;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseLeadForm(formData: FormData): ParsedLead | { error: string } {
  const customerName = readString(formData, "customer_name");
  const phone = readString(formData, "phone");
  const service = readString(formData, "service");
  const amountRaw = readString(formData, "estimate_amount");
  const statusRaw = readString(formData, "status");
  const followUpDate = readString(formData, "follow_up_date");

  if (!customerName) return { error: "Customer name is required." };
  if (!phone) return { error: "Phone number is required." };
  if (!service) return { error: "Service is required." };
  if (!isLeadStatus(statusRaw)) return { error: "Pick a valid status." };

  const amount = amountRaw === "" ? 0 : Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Estimate amount must be a positive number." };
  }

  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
    return { error: "Follow-up date must be a valid date." };
  }

  return {
    customer_name: customerName,
    phone,
    service,
    estimate_amount: Math.round(amount * 100) / 100,
    status: statusRaw,
    follow_up_date: followUpDate || null,
  };
}

function revalidate() {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function createLeadAction(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = parseLeadForm(formData);
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

  const { error } = await supabase.from("leads").insert({
    ...parsed,
    business_id: business.id,
    created_by: user.id,
    next_follow_up_at: nextFollowUpAt,
  });

  if (error) {
    return { status: "error", error: error.message };
  }

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

  const parsed = parseLeadForm(formData);
  if ("error" in parsed) {
    return { status: "error", error: parsed.error };
  }

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update(parsed)
    .eq("id", leadId)
    .eq("business_id", business.id);

  if (error) {
    return { status: "error", error: error.message };
  }

  revalidate();
  return { status: "success", submittedAt: Date.now() };
}

export async function updateLeadStatusAction(leadId: string, status: string) {
  if (!isLeadStatus(status)) {
    return { error: "Unknown status." };
  }

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("business_id", business.id);

  if (error) {
    return { error: error.message };
  }

  revalidate();
  return { error: undefined };
}

export async function deleteLeadAction(leadId: string) {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("business_id", business.id);

  if (error) {
    return { error: error.message };
  }

  revalidate();
  return { error: undefined };
}
