"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };

function revalidateLead(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Set or clear a lead's manual follow-up date. */
export async function scheduleFollowUpAction(leadId: string, date: string | null): Promise<Result> {
  const { user, business } = await requireBusinessContext();
  if (date && !isoDate(date)) return { error: "Enter a valid date." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ follow_up_date: date })
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  await logActivity({
    businessId: business.id,
    leadId,
    userId: user.id,
    type: date ? "followup_scheduled" : "followup_cleared",
    metadata: date ? { follow_up_date: date } : null,
  });
  revalidateLead(leadId);
  return {};
}

/** Record a manual contact: stamps the time and bumps the follow-up count. */
export async function logContactAction(leadId: string): Promise<Result> {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("follow_up_count")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const { error } = await supabase
    .from("leads")
    .update({
      last_follow_up_at: new Date().toISOString(),
      follow_up_count: (lead.follow_up_count ?? 0) + 1,
    })
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  await logActivity({ businessId: business.id, leadId, userId: user.id, type: "contacted" });
  revalidateLead(leadId);
  return {};
}

/** Pause or resume autopilot for a single lead. */
export async function setAutopilotPausedAction(leadId: string, paused: boolean): Promise<Result> {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ autopilot_paused: paused })
    .eq("id", leadId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  await logActivity({
    businessId: business.id,
    leadId,
    userId: user.id,
    type: paused ? "autopilot_paused" : "autopilot_resumed",
  });
  revalidateLead(leadId);
  return {};
}

/** Add a note to a lead. */
export async function addNoteAction(leadId: string, body: string): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_notes").insert({
    business_id: business.id,
    lead_id: leadId,
    body: trimmed,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  await logActivity({ businessId: business.id, leadId, userId: user.id, type: "note_added" });
  revalidateLead(leadId);
  return {};
}

export async function updateNoteAction(noteId: string, leadId: string, body: string): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Note cannot be empty." };

  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_notes")
    .update({ body: trimmed })
    .eq("id", noteId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  revalidateLead(leadId);
  return {};
}

export async function deleteNoteAction(noteId: string, leadId: string): Promise<Result> {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_notes")
    .delete()
    .eq("id", noteId)
    .eq("business_id", business.id);
  if (error) return { error: error.message };

  revalidateLead(leadId);
  return {};
}
