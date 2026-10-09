"use server";

import { revalidatePath } from "next/cache";

import { AiNotConfiguredError, isAiConfigured } from "@/lib/ai/anthropic";
import { requireBusinessContext } from "@/lib/business";
import { isEmailAddress } from "@/lib/gmail/mime";
import {
  createDraftFor,
  getConnection,
  sendApprovedDraft,
  syncConnection,
} from "@/lib/gmail/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inbox actions. Each one works only on the member's active business: the id
 * comes from requireBusinessContext (membership checked through RLS), and every
 * query below filters by it. Writes use the service role because these tables
 * are read-only for signed-in users (migration 0012).
 */

export type InboxActionResult = { ok?: boolean; error?: string; message?: string };

const NOT_READY = "Email isn't set up on this WinBack environment yet.";

function done(result: InboxActionResult): InboxActionResult {
  revalidatePath("/inbox");
  return result;
}

export async function syncInboxAction(): Promise<InboxActionResult> {
  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };

  const connection = await getConnection(admin, business.id);
  if (!connection) return { error: "Connect this business's Gmail first." };

  const result = await syncConnection(admin, connection);
  if (result.error) {
    return done({ error: "Couldn't check Gmail right now. Try again, or reconnect Gmail in Settings." });
  }
  return done({
    ok: true,
    message:
      result.imported === 0
        ? "No new email."
        : `${result.imported} new email${result.imported === 1 ? "" : "s"}, ${result.drafted} AI draft${result.drafted === 1 ? "" : "s"}.`,
  });
}

export async function draftReplyAction(messageId: string): Promise<InboxActionResult> {
  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };
  if (!isAiConfigured()) return { error: "The AI isn't configured on this environment." };

  const { data: message } = await admin
    .from("email_messages")
    .select("*")
    .eq("id", messageId)
    .eq("business_id", business.id)
    .eq("direction", "inbound")
    .maybeSingle();
  if (!message) return { error: "That email isn't in this business's inbox." };

  try {
    const created = await createDraftFor(admin, message);
    return done(
      created
        ? { ok: true }
        : { error: "No draft was written: the AI judged this email needs no reply, or a draft already exists." },
    );
  } catch (cause) {
    if (cause instanceof AiNotConfiguredError) return { error: "The AI isn't configured on this environment." };
    return { error: "The AI couldn't write a draft right now. Try again." };
  }
}

export async function saveDraftAction(draftId: string, body: string): Promise<InboxActionResult> {
  const text = body.trim();
  if (!text) return { error: "The reply can't be empty." };
  if (text.length > 10_000) return { error: "That reply is too long." };

  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };

  const { data } = await admin
    .from("email_drafts")
    .update({ body: text })
    .eq("id", draftId)
    .eq("business_id", business.id)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (!data) return { error: "This draft can no longer be edited." };
  return done({ ok: true });
}

/**
 * The only path that sends email: one member, one click, one draft. The text
 * sent is the text saved on this draft, so edits are saved first by the UI.
 */
export async function approveAndSendDraftAction(draftId: string): Promise<InboxActionResult> {
  const { user, business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };

  const outcome = await sendApprovedDraft(admin, { businessId: business.id, draftId, userId: user.id });
  if (!outcome.ok) return done({ error: outcome.error });
  return done({ ok: true, message: "Sent from your Gmail." });
}

export async function discardDraftAction(draftId: string): Promise<InboxActionResult> {
  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };

  const { data } = await admin
    .from("email_drafts")
    .update({ status: "discarded" })
    .eq("id", draftId)
    .eq("business_id", business.id)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (!data) return { error: "This draft can no longer be discarded." };
  return done({ ok: true });
}

/**
 * Saves the sender's address on one of this business's leads and attaches the
 * email to it, so later emails from them match automatically.
 */
export async function linkEmailToLeadAction(messageId: string, leadId: string): Promise<InboxActionResult> {
  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (!admin) return { error: NOT_READY };

  const { data: message } = await admin
    .from("email_messages")
    .select("id, from_address")
    .eq("id", messageId)
    .eq("business_id", business.id)
    .maybeSingle();
  const { data: lead } = await admin
    .from("leads")
    .select("id, email")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!message || !lead) return { error: "That email or lead isn't in this business." };
  if (!isEmailAddress(message.from_address)) return { error: "That sender address can't be saved." };

  if (!lead.email) {
    await admin.from("leads").update({ email: message.from_address }).eq("id", lead.id).eq("business_id", business.id);
  }
  await admin
    .from("email_messages")
    .update({ lead_id: lead.id })
    .eq("business_id", business.id)
    .eq("from_address", message.from_address);
  await admin
    .from("email_drafts")
    .update({ lead_id: lead.id })
    .eq("business_id", business.id)
    .eq("to_address", message.from_address)
    .in("status", ["draft", "failed"]);

  revalidatePath(`/leads/${lead.id}`);
  return done({ ok: true });
}
