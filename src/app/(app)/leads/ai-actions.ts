"use server";

import { requireBusinessContext } from "@/lib/business";
import type { AiMessageStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the AI follow-up approval workflow: draft -> approved ->
 * sent. Sending is not implemented, so the furthest a message goes here is
 * "approved". Every action is scoped to the caller's business by RLS and by an
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

  const { data, error } = await supabase
    .from("ai_messages")
    .update({ message: trimmed })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited"])
    .select("id, status")
    .maybeSingle();

  if (error) return { error: error.message };
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
    .select("id, status, approved_at")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be approved." };

  await supabase.from("ai_audit_log").insert({
    business_id: business.id,
    ai_message_id: messageId,
    event: "message_approved",
    detail: { approved_by: user.id },
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

  if (error) return { error: error.message };
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

  if (error) return { error: error.message };
  if (!data) return { error: "This message can no longer be cancelled." };

  return { status: data.status };
}
