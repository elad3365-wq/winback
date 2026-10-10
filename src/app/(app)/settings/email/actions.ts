"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import type { GmailReplyStatus } from "@/lib/database.types";
import { sendRawMessage } from "@/lib/gmail/api";
import { isGmailFeatureEnabled } from "@/lib/gmail/config";
import { disconnect, getAccessToken } from "@/lib/gmail/connection";
import { buildRawReply, buildReferences, replySubject } from "@/lib/gmail/parse";
import {
  inboundReplyReason,
  isUnsubscribeRequest,
  leadUpdateForInboundReply,
} from "@/lib/gmail/reply-detection";
import { generateReply, type ReplyInputs } from "@/lib/gmail/reply";
import { syncInbox } from "@/lib/gmail/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the per-business Gmail workflow. Every action re-resolves
 * the caller's business and runs under the RLS-bound client, so a business can
 * only ever touch its own mail. Approval & send transitions are additionally
 * enforced owner-only by the DB trigger (migration 0011). Real sending is also
 * gated behind WINBACK_GMAIL_ALLOW_SEND so no email leaves during the pilot
 * until it is explicitly switched on.
 */

export type ActionResult<T = undefined> = { error?: string; ok?: boolean; data?: T };

function ensureEnabled(): string | null {
  return isGmailFeatureEnabled() ? null : "Gmail integration is not enabled in this environment.";
}

export async function syncInboxAction(): Promise<ActionResult<{ stored: number; skipped: number }>> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  try {
    const result = await syncInbox(supabase, business.id, { maxResults: 25 });
    revalidatePath("/settings/email");
    return { ok: true, data: { stored: result.stored, skipped: result.skipped } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not sync the inbox." };
  }
}

export async function disconnectGmailAction(): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can disconnect Gmail." };
  const supabase = await createClient();
  try {
    await disconnect(supabase, business.id);
    revalidatePath("/settings/email");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not disconnect." };
  }
}

export async function linkMessageToLeadAction(
  messageId: string,
  leadId: string | null,
): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  // leadId must belong to the same business (also enforced by the composite FK).
  const { data: message, error } = await supabase
    .from("business_email_messages")
    .update({ lead_id: leadId })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .select("id, direction, body_text, snippet")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!message) return { error: "Message not found." };

  // Reply detection: linking an INBOUND email to a lead means the customer
  // engaged — stop the autopilot for that lead (unsubscribe = hard stop,
  // otherwise pause). Idempotent, and scoped to this business by RLS.
  if (leadId && message.direction === "inbound") {
    const unsubscribe = isUnsubscribeRequest(message.body_text ?? message.snippet ?? "");
    const update = leadUpdateForInboundReply({ unsubscribe });
    await supabase.from("leads").update(update).eq("id", leadId).eq("business_id", business.id);

    const reason = inboundReplyReason({ unsubscribe });
    await supabase.from("lead_activity").insert({
      business_id: business.id,
      lead_id: leadId,
      type: reason,
      metadata: { message_id: messageId },
    });
    await supabase.from("ai_audit_log").insert({
      business_id: business.id,
      lead_id: leadId,
      event: reason,
      detail: { message_id: messageId },
    });
  }

  revalidatePath("/settings/email");
  return { ok: true };
}

export async function generateReplyAction(messageId: string): Promise<ActionResult<{ replyId: string }>> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: message } = await supabase
    .from("business_email_messages")
    .select("*")
    .eq("id", messageId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!message) return { error: "Message not found." };

  // Duplicate prevention: reuse an existing active draft for this message
  // instead of generating (and paying for) a second one.
  const { data: existingReply } = await supabase
    .from("business_email_replies")
    .select("id")
    .eq("business_id", business.id)
    .eq("message_id", message.id)
    .in("status", ["draft", "edited", "approved"])
    .limit(1)
    .maybeSingle();
  if (existingReply) {
    return { ok: true, data: { replyId: existingReply.id } };
  }

  const [{ data: settings }, lead] = await Promise.all([
    supabase.from("business_ai_settings").select("*").eq("business_id", business.id).maybeSingle(),
    message.lead_id
      ? supabase.from("leads").select("customer_name, service, estimate_amount").eq("id", message.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const inputs: ReplyInputs = {
    businessName: business.name,
    businessType: business.business_type ?? business.custom_business_type ?? null,
    financingAvailable: settings?.financing_available ?? false,
    paymentPlansAvailable: settings?.payment_plans_available ?? false,
    maximumDiscountPercent: settings?.maximum_discount_percent ?? 0,
    aiCanOfferDiscounts: settings?.ai_can_offer_discounts ?? false,
    businessHours: settings?.business_hours ?? null,
    additionalRules: settings?.additional_rules ?? null,
    tone: settings?.tone ?? "professional",
    currency: business.currency || "USD",
    inbound: {
      fromName: message.from_address,
      subject: message.subject,
      bodyText: message.body_text ?? message.snippet ?? "",
    },
    lead: lead.data
      ? {
          customerName: lead.data.customer_name,
          service: lead.data.service,
          estimateAmount: Number(lead.data.estimate_amount) || 0,
        }
      : null,
  };

  let generated;
  try {
    generated = await generateReply(inputs);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI reply generation failed." };
  }
  if (!generated.content) return { error: "Couldn't generate a usable reply. Please try again." };

  const { data: saved, error } = await supabase
    .from("business_email_replies")
    .insert({
      business_id: business.id,
      message_id: message.id,
      lead_id: message.lead_id,
      status: "draft",
      body: generated.content,
      ai_model: generated.model,
      discount_offered: generated.discountOffered,
      prompt_inputs: { inbound_subject: message.subject, lead_id: message.lead_id },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !saved) return { error: error?.message ?? "Could not save the draft." };

  revalidatePath("/settings/email");
  return { ok: true, data: { replyId: saved.id } };
}

export async function saveReplyEditAction(replyId: string, body: string): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const trimmed = body.trim();
  if (!trimmed) return { error: "The reply can't be empty." };
  if (trimmed.length > 8000) return { error: "That reply is too long." };
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_email_replies")
    .update({ body: trimmed, status: "edited" })
    .eq("id", replyId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited"])
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This reply can no longer be edited." };
  revalidatePath("/settings/email");
  return { ok: true };
}

export async function approveReplyAction(replyId: string): Promise<ActionResult<{ status: GmailReplyStatus }>> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  // The DB trigger enforces owner-only approval and server-stamps approved_at/by.
  const { data, error } = await supabase
    .from("business_email_replies")
    .update({ status: "approved" })
    .eq("id", replyId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited"])
    .select("id, status")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This reply can no longer be approved." };
  revalidatePath("/settings/email");
  return { ok: true, data: { status: data.status } };
}

export async function cancelReplyAction(replyId: string): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { business } = await requireBusinessContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_email_replies")
    .update({ status: "cancelled" })
    .eq("id", replyId)
    .eq("business_id", business.id)
    .in("status", ["draft", "edited", "approved"])
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This reply can no longer be cancelled." };
  revalidatePath("/settings/email");
  return { ok: true };
}

/**
 * Send an APPROVED reply via Gmail. Double-gated: the feature must be enabled
 * AND WINBACK_GMAIL_ALLOW_SEND must be "true" — otherwise nothing is sent, so no
 * real email can leave during the pilot without an explicit opt-in. The DB
 * trigger independently enforces owner-only + approved-only sending.
 */
export async function sendReplyAction(replyId: string): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  if (process.env.WINBACK_GMAIL_ALLOW_SEND?.trim() !== "true") {
    return { error: "Sending is disabled in this environment (WINBACK_GMAIL_ALLOW_SEND is not on)." };
  }

  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can send." };
  const supabase = await createClient();

  const { data: reply } = await supabase
    .from("business_email_replies")
    .select("*")
    .eq("id", replyId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!reply) return { error: "Reply not found." };
  if (reply.status !== "approved") return { error: "Only an approved reply can be sent." };

  const { data: message } = await supabase
    .from("business_email_messages")
    .select("*")
    .eq("id", reply.message_id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!message) return { error: "Original message not found." };

  const { data: connection } = await supabase
    .from("business_gmail_connections")
    .select("google_account_email")
    .eq("business_id", business.id)
    .maybeSingle();
  if (!connection) return { error: "Gmail is not connected." };

  const to = message.from_address;
  if (!to) return { error: "The original message has no sender address to reply to." };

  const raw = buildRawReply({
    from: connection.google_account_email,
    to: [to],
    subject: replySubject(message.subject),
    inReplyTo: message.rfc822_message_id,
    references: buildReferences(message.email_references, message.rfc822_message_id),
    body: reply.body,
  });

  let sentMessageId: string;
  try {
    const accessToken = await getAccessToken(supabase, business.id);
    const result = await sendRawMessage(accessToken, raw, message.gmail_thread_id ?? undefined);
    sentMessageId = result.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sending failed." };
  }

  // Record the send. The trigger enforces approved → sent and stamps sent_at.
  const { error: updErr } = await supabase
    .from("business_email_replies")
    .update({ status: "sent", gmail_sent_message_id: sentMessageId })
    .eq("id", replyId)
    .eq("business_id", business.id);
  if (updErr) return { error: `Sent, but could not record it: ${updErr.message}` };

  revalidatePath("/settings/email");
  return { ok: true };
}
