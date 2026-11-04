import "server-only";

import { sendRawMessage } from "@/lib/gmail/api";
import { getAccessToken } from "@/lib/gmail/connection";
import { buildRawReply, buildReferences, replySubject } from "@/lib/gmail/parse";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The ONE path that actually puts a reply on the wire, used by both the owner's
 * manual "Send" and the autonomous engine. Hard-gated by WINBACK_GMAIL_ALLOW_SEND
 * so no real email can leave unless an operator explicitly switched sending on —
 * independent of autonomy level. The reply is marked sent only AFTER Gmail
 * confirms, and only via the SERVICE ROLE (users cannot set the send fields;
 * migration 0011). Sends in the ORIGINAL Gmail thread (threadId + RFC822
 * In-Reply-To/References) so the customer sees one conversation.
 */

export type SendOutcome =
  | { ok: true; gmailMessageId: string }
  | { ok: false; error: string; code?: string };

export function sendingAllowedGlobally(): boolean {
  return process.env.WINBACK_GMAIL_ALLOW_SEND?.trim() === "true";
}

/**
 * Send a reply. `approve` lets the autonomous engine approve-and-send in one
 * step (service role); the owner UI passes a reply that's already approved.
 */
export async function sendApprovedReply(opts: {
  businessId: string;
  replyId: string;
  approve?: boolean;
  approvedBy?: string | null;
}): Promise<SendOutcome> {
  if (!sendingAllowedGlobally()) {
    return { ok: false, error: "Sending is disabled in this environment (WINBACK_GMAIL_ALLOW_SEND is not on).", code: "send_disabled" };
  }

  const db = createAdminClient();
  if (!db) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured.", code: "no_service_role" };

  const { data: reply } = await db
    .from("business_email_replies")
    .select("*")
    .eq("id", opts.replyId)
    .eq("business_id", opts.businessId)
    .maybeSingle();
  if (!reply) return { ok: false, error: "Reply not found.", code: "not_found" };
  if (reply.status === "sent") return { ok: false, error: "This reply was already sent.", code: "already_sent" };

  if (reply.status !== "approved") {
    if (!opts.approve) return { ok: false, error: "Only an approved reply can be sent.", code: "not_approved" };
    // Approve via the service role (trusted backend path).
    await db
      .from("business_email_replies")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: opts.approvedBy ?? null })
      .eq("id", opts.replyId)
      .eq("business_id", opts.businessId);
  }

  const { data: message } = await db
    .from("business_email_messages")
    .select("*")
    .eq("id", reply.message_id)
    .eq("business_id", opts.businessId)
    .maybeSingle();
  if (!message) return { ok: false, error: "Original message not found.", code: "no_message" };

  const { data: connection } = await db
    .from("business_gmail_connections")
    .select("google_account_email, revoked_at")
    .eq("business_id", opts.businessId)
    .maybeSingle();
  if (!connection || connection.revoked_at) return { ok: false, error: "Gmail is not connected.", code: "not_connected" };

  const to = message.from_address;
  if (!to) return { ok: false, error: "The original message has no sender address to reply to.", code: "no_recipient" };

  const raw = buildRawReply({
    from: connection.google_account_email,
    to: [to],
    subject: replySubject(message.subject),
    inReplyTo: message.rfc822_message_id,
    references: buildReferences(message.email_references, message.rfc822_message_id),
    body: reply.body,
  });

  let gmailMessageId: string;
  try {
    const accessToken = await getAccessToken(opts.businessId);
    const result = await sendRawMessage(accessToken, raw, message.gmail_thread_id ?? undefined);
    gmailMessageId = result.id;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sending failed.", code: "gmail_error" };
  }

  const { error: updErr } = await db
    .from("business_email_replies")
    .update({ status: "sent", sent_at: new Date().toISOString(), gmail_sent_message_id: gmailMessageId })
    .eq("id", opts.replyId)
    .eq("business_id", opts.businessId);
  if (updErr) return { ok: false, error: `Sent, but could not record it: ${updErr.message}`, code: "record_failed" };

  return { ok: true, gmailMessageId };
}
