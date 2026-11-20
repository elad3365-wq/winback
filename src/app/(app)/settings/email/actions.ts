"use server";

import { revalidatePath } from "next/cache";

import { logActivity } from "@/lib/activity";
import { requireBusinessContext } from "@/lib/business";
import type { GmailReplyStatus } from "@/lib/database.types";
import { canGenerateDraft, resolveAiPolicy, utcDayStartIso } from "@/lib/ai/guard";
import { resolveFollowupModel } from "@/lib/ai/models";
import { isGmailFeatureEnabled } from "@/lib/gmail/config";
import { disconnect } from "@/lib/gmail/connection";
import { gmailErrorMessage } from "@/lib/gmail/errors";
import {
  inboundReplyReason,
  isUnsubscribeRequest,
  leadUpdateForInboundReply,
} from "@/lib/gmail/reply-detection";
import { AI_FAILURE_MESSAGES, classifyAiError, isAiConfigured } from "@/lib/ai/anthropic";
import { parseReviewFlags, type ReviewFlag } from "@/lib/ai/review";
import { generateReply, type ReplyInputs } from "@/lib/gmail/reply";
import { sendApprovedReply, sendingAllowedGlobally } from "@/lib/gmail/send";
import { syncInbox } from "@/lib/gmail/sync";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Shown instead of raw Postgres / RLS text (that is logged server-side). */
const SAVE_FAILED = "Couldn't save that change. Please refresh the page and try again.";

function logDbError(where: string, error: { message?: string } | null | undefined) {
  if (error) console.error(`[email/${where}]`, error.message ?? error);
}

export async function syncInboxAction(): Promise<ActionResult<{ stored: number; skipped: number }>> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { business } = await requireBusinessContext();
  try {
    const result = await syncInbox(business.id, { maxResults: 25 });
    revalidatePath("/settings/email");
    return { ok: true, data: { stored: result.stored, skipped: result.skipped } };
  } catch (error) {
    console.error("[email/sync] failed", error instanceof Error ? error.message : error);
    return { error: gmailErrorMessage(error, "Could not sync the inbox. Please try again.") };
  }
}

export async function disconnectGmailAction(): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can disconnect Gmail." };
  try {
    await disconnect(business.id);
    revalidatePath("/settings/email");
    return { ok: true };
  } catch (error) {
    console.error("[email/disconnect] failed", error instanceof Error ? error.message : error);
    return { error: gmailErrorMessage(error, "Could not disconnect. Please try again.") };
  }
}

export async function linkMessageToLeadAction(
  messageId: string,
  leadId: string | null,
): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  // The lead must belong to this business (the composite FK enforces it too,
  // but would surface as a raw constraint error).
  if (leadId) {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("business_id", business.id)
      .maybeSingle();
    logDbError("link", leadError);
    if (!lead) return { error: "That lead no longer exists. Refresh the page and pick another." };
  }

  const { data: message, error } = await supabase
    .from("business_email_messages")
    .update({ lead_id: leadId })
    .eq("id", messageId)
    .eq("business_id", business.id)
    .select("id, direction, body_text, snippet")
    .maybeSingle();
  if (error) {
    logDbError("link", error);
    return { error: SAVE_FAILED };
  }
  if (!message) return { error: "Message not found." };

  // Reply detection: linking an INBOUND email to a lead means the customer
  // engaged — stop the autopilot for that lead (unsubscribe = hard stop,
  // otherwise pause). Idempotent, and scoped to this business by RLS.
  let paused = false;
  if (leadId && message.direction === "inbound") {
    const unsubscribe = isUnsubscribeRequest(message.body_text ?? message.snippet ?? "");
    const update = leadUpdateForInboundReply({ unsubscribe });
    const { data: updated, error: leadUpdateError } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId)
      .eq("business_id", business.id)
      .select("id")
      .maybeSingle();
    logDbError("link", leadUpdateError);
    paused = Boolean(updated);

    // Timeline entry (member-insertable). ai_audit_log is service-role-only
    // under RLS, so it is not written from the user session.
    await logActivity({
      businessId: business.id,
      leadId,
      userId: user.id,
      type: inboundReplyReason({ unsubscribe }),
      metadata: { message_id: messageId, follow_ups_paused: paused },
    });
  }

  revalidatePath("/settings/email");
  return { ok: true };
}

export async function generateReplyAction(
  messageId: string,
): Promise<ActionResult<{ replyId: string; body?: string; flags?: ReviewFlag[] }>> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };
  if (!isAiConfigured()) return { error: AI_FAILURE_MESSAGES.not_configured };
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: message } = await supabase
    .from("business_email_messages")
    .select("*")
    .eq("id", messageId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!message) return { error: "Message not found." };
  if (message.direction !== "inbound") return { error: "Replies can only be drafted for emails you received." };

  // Duplicate prevention: reuse an existing active draft for this message
  // instead of generating (and paying for) a second one.
  const { data: existingReply } = await supabase
    .from("business_email_replies")
    .select("id, body, prompt_inputs")
    .eq("business_id", business.id)
    .eq("message_id", message.id)
    .in("status", ["draft", "edited", "approved"])
    .limit(1)
    .maybeSingle();
  if (existingReply) {
    const flags = parseReviewFlags((existingReply.prompt_inputs as { review_flags?: unknown } | null)?.review_flags);
    return { ok: true, data: { replyId: existingReply.id, body: existingReply.body, flags } };
  }

  const dayStart = utcDayStartIso();
  const [{ data: settings }, lead, { data: autonomy }, { data: knowledgeRows }, followupsToday, repliesToday] =
    await Promise.all([
      supabase.from("business_ai_settings").select("*").eq("business_id", business.id).maybeSingle(),
      message.lead_id
        ? supabase
            .from("leads")
            .select("customer_name, service, estimate_amount, unsubscribe_status")
            .eq("id", message.lead_id)
            .eq("business_id", business.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("business_ai_autonomy")
        .select("level, emergency_stop, daily_action_limit, daily_spend_limit_usd")
        .eq("business_id", business.id)
        .maybeSingle(),
      supabase
        .from("business_knowledge")
        .select("title, content")
        .eq("business_id", business.id)
        .eq("approved", true)
        .order("created_at", { ascending: true })
        .limit(25),
      supabase
        .from("ai_messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .gte("created_at", dayStart),
      supabase
        .from("business_email_replies")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .gte("created_at", dayStart),
    ]);

  if (lead.data?.unsubscribe_status === "unsubscribed") {
    return { error: "This customer unsubscribed — WinBack won't draft messages to them." };
  }

  // Same per-business AI controls as follow-up drafts: AI "off" blocks this,
  // and today's spend cap counts follow-ups and email replies together.
  const guard = canGenerateDraft({
    policy: resolveAiPolicy(autonomy),
    trigger: "manual",
    draftsToday: (followupsToday.count ?? 0) + (repliesToday.count ?? 0),
    model: resolveFollowupModel(),
  });
  if (!guard.ok) return { error: guard.message };

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
    knowledge: (knowledgeRows ?? []).map((k) => (k.title ? `${k.title}: ${k.content}` : k.content)),
  };

  let generated;
  try {
    generated = await generateReply(inputs);
  } catch (error) {
    const kind = classifyAiError(error);
    console.error(`[email/reply] generation failed (${kind})`, error);
    return { error: AI_FAILURE_MESSAGES[kind] };
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
      prompt_inputs: {
        source: "manual",
        inbound_subject: message.subject,
        lead_id: message.lead_id,
        knowledge_entries: inputs.knowledge?.length ?? 0,
        review_flags: generated.flags,
        usage: generated.usage ?? null,
      },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !saved) {
    logDbError("reply", error);
    return { error: "Generated the reply but couldn't save it. Please try again." };
  }

  revalidatePath("/settings/email");
  return { ok: true, data: { replyId: saved.id, body: generated.content, flags: generated.flags } };
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
  if (error) {
    logDbError("edit", error);
    return { error: SAVE_FAILED };
  }
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
  if (error) {
    logDbError("approve", error);
    // The DB trigger allows only the business owner to approve.
    return {
      error: /only the business owner/i.test(error.message ?? "")
        ? "Only the business owner can approve replies."
        : SAVE_FAILED,
    };
  }
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
  if (error) {
    logDbError("cancel", error);
    return { error: SAVE_FAILED };
  }
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

  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can send." };
  if (!sendingAllowedGlobally()) {
    return { error: "Sending from WinBack is turned off during the beta. Copy the reply into Gmail, then mark it as sent." };
  }

  // The reply must already be approved (owner approved it via the UI, enforced
  // by the DB trigger). Sending itself — the WINBACK_GMAIL_ALLOW_SEND gate, the
  // Gmail call, and the service-role mark-sent — runs through the single shared
  // send path so manual and autonomous sends behave identically.
  const result = await sendApprovedReply({ businessId: business.id, replyId });
  if (!result.ok) {
    console.error(`[email/send] failed (${result.code ?? "unknown"})`, result.error);
    return { error: result.code === "gmail_error" ? "Gmail couldn't send this reply. Please try again." : result.error };
  }

  revalidatePath("/settings/email");
  return { ok: true };
}

/**
 * Assisted workflow (no sending from WinBack): the owner copied an APPROVED
 * reply into Gmail and sent it themselves. Record that so the inbox and the
 * lead timeline show it. Users may never set status 'sent' directly (DB
 * trigger), so after verifying the caller is the OWNER and the reply is
 * approved in THIS business, the service role records it. No Gmail call is
 * made; gmail_sent_message_id stays null, which marks it as sent by hand.
 */
export async function markReplySentManuallyAction(replyId: string): Promise<ActionResult> {
  const disabled = ensureEnabled();
  if (disabled) return { error: disabled };

  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can mark replies as sent." };

  const supabase = await createClient();
  const { data: reply } = await supabase
    .from("business_email_replies")
    .select("id, status, lead_id, message_id")
    .eq("id", replyId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!reply) return { error: "Reply not found." };
  if (reply.status === "sent") return { ok: true };
  if (reply.status !== "approved") return { error: "Approve the reply before marking it as sent." };

  const admin = createAdminClient();
  if (!admin) return { error: gmailErrorMessage(new Error("SUPABASE_SERVICE_ROLE_KEY")) };
  const { data: updated, error } = await admin
    .from("business_email_replies")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", replyId)
    .eq("business_id", business.id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) {
    logDbError("mark-sent", error);
    return { error: SAVE_FAILED };
  }
  if (!updated) return { error: "This reply changed in the meantime. Refresh the page and try again." };

  if (reply.lead_id) {
    await logActivity({
      businessId: business.id,
      leadId: reply.lead_id,
      userId: user.id,
      type: "email_reply_sent_manually",
      metadata: { reply_id: replyId, message_id: reply.message_id },
    });
  }

  revalidatePath("/settings/email");
  return { ok: true };
}
