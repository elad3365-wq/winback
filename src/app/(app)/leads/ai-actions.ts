"use server";

import { revalidatePath } from "next/cache";

import { logActivity } from "@/lib/activity";
import { requireBusinessContext } from "@/lib/business";
import type { AiMessageStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const SAVE_FAILED = "Couldn't save that change. Please try again.";

/** Log the raw database error server-side; show the owner something friendly. */
function dbError(action: string, error: { message: string }): AiMessageActionResult {
  console.error(`[ai-actions] ${action} failed`, error.message);
  return { error: SAVE_FAILED };
}

/**
 * Server actions for the AI follow-up approval workflow:
 *   draft -> (edited) -> approved -> sent (manually, outside WinBack)
 *                       \-> cancelled
 * WinBack never sends anything itself: "sent" only records that the owner
 * copied the approved text and sent it from their own phone or email. Every action is scoped to the caller's business by RLS and by an
 * explicit business_id filter, and only moves a message between allowed states.
 */

export type AiMessageActionResult = {
  error?: string;
  status?: AiMessageStatus;
  approvedAt?: string | null;
};

/** Persist a human edit to a draft. Allowed only while still a draft. */
export async function saveAiMessageEditAction(
  messageId: string,
  message: string,
): Promise<AiMessageActionResult> {
  const trimmed = message.trim();
  if (!messageId) return { error: "Missing message id." };
  if (!trimmed) return { error: "The message can't be empty." };
  if (trimmed.length > 4000) return { error: "That message is too long." };

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  // A human edit is recorded as status "edited" so history shows which
  // approved messages were changed from the AI's original wording.
  const { data, error } = await supabase
    .from("ai_messages")
    .update({ message: trimmed, status: "edited" })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited"])
    .select("id, status")
    .maybeSingle();

  if (error) return dbError("save", error);
  if (!data) return { error: "This message can no longer be edited." };

  return { status: data.status };
}

/**
 * Approve a draft so it is ready to send (sending is a later phase). Records
 * who approved it and when. Allowed only from draft/edited.
 */
export async function approveAiMessageAction(
  messageId: string,
): Promise<AiMessageActionResult> {
  if (!messageId) return { error: "Missing message id." };

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_messages")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited"])
    .select("id, status, approved_at, lead_id")
    .maybeSingle();

  if (error) return dbError("approve", error);
  if (!data) return { error: "This message can no longer be approved." };

  // ai_audit_log is service-role-write only (no INSERT policy for members), so
  // the owner-visible record of the approval lives in the lead's timeline.
  await logActivity({
    businessId: business.id,
    leadId: data.lead_id,
    userId: user.id,
    type: "ai_message_approved",
    metadata: { ai_message_id: messageId },
  });

  return { status: data.status, approvedAt: data.approved_at };
}

/** Reopen an approved message for editing (back to draft). Clears the approval audit. */
export async function reopenAiMessageAction(
  messageId: string,
): Promise<AiMessageActionResult> {
  if (!messageId) return { error: "Missing message id." };

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_messages")
    .update({ status: "draft", approved_at: null, approved_by: null })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .eq("status", "approved")
    .select("id, status")
    .maybeSingle();

  if (error) return dbError("reopen", error);
  if (!data) return { error: "This message can no longer be reopened." };

  return { status: data.status };
}

/** Cancel a draft or approved message so it is never used. */
export async function cancelAiMessageAction(
  messageId: string,
): Promise<AiMessageActionResult> {
  if (!messageId) return { error: "Missing message id." };

  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_messages")
    .update({ status: "cancelled" })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited", "approved"])
    .select("id, status")
    .maybeSingle();

  if (error) return dbError("cancel", error);
  if (!data) return { error: "This message can no longer be cancelled." };

  return { status: data.status };
}

/**
 * The owner sent an approved message themselves (copied it into their phone or
 * email). Records it as sent, counts it as a contact on the lead, and logs it to
 * the lead's timeline. Allowed only from "approved" — nothing unreviewed can be
 * marked sent. WinBack itself sends nothing here.
 */
export async function markAiMessageSentManuallyAction(
  messageId: string,
): Promise<AiMessageActionResult> {
  if (!messageId) return { error: "Missing message id." };

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();
  const sentAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("ai_messages")
    .update({ status: "sent", sent_at: sentAt })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .eq("status", "approved")
    .select("id, status, lead_id, channel")
    .maybeSingle();

  if (error) return dbError("mark sent", error);
  if (!data) return { error: "Only an approved message can be marked as sent." };

  // Count it as a follow-up on the lead (same as "Log contact").
  const { data: lead } = await supabase
    .from("leads")
    .select("follow_up_count")
    .eq("id", data.lead_id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (lead) {
    await supabase
      .from("leads")
      .update({ last_follow_up_at: sentAt, follow_up_count: (lead.follow_up_count ?? 0) + 1 })
      .eq("id", data.lead_id)
      .eq("business_id", business.id);
  }

  await logActivity({
    businessId: business.id,
    leadId: data.lead_id,
    userId: user.id,
    type: "ai_message_sent_manually",
    metadata: { channel: data.channel, ai_message_id: messageId },
  });

  revalidatePath(`/leads/${data.lead_id}`);
  revalidatePath("/dashboard");
  return { status: data.status };
}
