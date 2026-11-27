"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import { logActivity } from "@/lib/activity";
import { LEAD_NOT_FOUND } from "@/lib/lead-input";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string };

function revalidateLead(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

const SAVE_FAILED = "Could not save that change. Please try again.";
const NOTE_NOT_FOUND = "That note was not found. Refresh the page.";
const NOTE_MAX = 5000;

/**
 * RLS turns a blocked UPDATE/DELETE into "0 rows, no error". Every write here
 * asks for the affected ids back, and an empty result is reported as a
 * failure instead of a silent success.
 */
function outcome(
  label: string,
  result: { data: { id: string }[] | null; error: { message: string } | null },
  notFound: string,
): Result | null {
  if (result.error) {
    console.error(`${label} failed`, result.error);
    return { error: SAVE_FAILED };
  }
  if (!result.data || result.data.length === 0) return { error: notFound };
  return null;
}

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Set or clear a lead's manual follow-up date. */
export async function scheduleFollowUpAction(leadId: string, date: string | null): Promise<Result> {
  const { user, business } = await requireBusinessContext();
  if (date && !isoDate(date)) return { error: "Enter a valid date." };

  const supabase = await createClient();
  const failed = outcome(
    "scheduleFollowUpAction",
    await supabase
      .from("leads")
      .update({ follow_up_date: date })
      .eq("id", leadId)
      .eq("business_id", business.id)
      .select("id"),
    LEAD_NOT_FOUND,
  );
  if (failed) return failed;

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
  if (!lead) return { error: LEAD_NOT_FOUND };

  const failed = outcome(
    "logContactAction",
    await supabase
      .from("leads")
      .update({
        last_follow_up_at: new Date().toISOString(),
        follow_up_count: (lead.follow_up_count ?? 0) + 1,
      })
      .eq("id", leadId)
      .eq("business_id", business.id)
      .select("id"),
    LEAD_NOT_FOUND,
  );
  if (failed) return failed;

  await logActivity({ businessId: business.id, leadId, userId: user.id, type: "contacted" });
  revalidateLead(leadId);
  return {};
}

/** Pause or resume autopilot for a single lead. */
export async function setAutopilotPausedAction(leadId: string, paused: boolean): Promise<Result> {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();
  const failed = outcome(
    "setAutopilotPausedAction",
    await supabase
      .from("leads")
      .update({ autopilot_paused: paused })
      .eq("id", leadId)
      .eq("business_id", business.id)
      .select("id"),
    LEAD_NOT_FOUND,
  );
  if (failed) return failed;

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
  if (trimmed.length > NOTE_MAX) return { error: `Notes can be up to ${NOTE_MAX} characters.` };

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();
  // The lead_notes trigger rejects a lead from another business; this check
  // just turns that into a clear message.
  const failed = outcome(
    "addNoteAction",
    await supabase
      .from("lead_notes")
      .insert({
        business_id: business.id,
        lead_id: leadId,
        body: trimmed,
        created_by: user.id,
      })
      .select("id"),
    LEAD_NOT_FOUND,
  );
  if (failed) return failed;

  await logActivity({ businessId: business.id, leadId, userId: user.id, type: "note_added" });
  revalidateLead(leadId);
  return {};
}

export async function updateNoteAction(noteId: string, leadId: string, body: string): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Note cannot be empty." };
  if (trimmed.length > NOTE_MAX) return { error: `Notes can be up to ${NOTE_MAX} characters.` };

  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const failed = outcome(
    "updateNoteAction",
    await supabase
      .from("lead_notes")
      .update({ body: trimmed })
      .eq("id", noteId)
      .eq("business_id", business.id)
      .select("id"),
    NOTE_NOT_FOUND,
  );
  if (failed) return failed;

  revalidateLead(leadId);
  return {};
}

export async function deleteNoteAction(noteId: string, leadId: string): Promise<Result> {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const failed = outcome(
    "deleteNoteAction",
    await supabase
      .from("lead_notes")
      .delete()
      .eq("id", noteId)
      .eq("business_id", business.id)
      .select("id"),
    NOTE_NOT_FOUND,
  );
  if (failed) return failed;

  revalidateLead(leadId);
  return {};
}
