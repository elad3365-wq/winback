import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAiConfigured } from "@/lib/ai/anthropic";
import type { Database, EmailMessage, GmailConnection } from "@/lib/database.types";
import { emailReplyInputs, generateEmailReply } from "@/lib/gmail/ai-reply";
import { getGmailOAuthConfig, getTokenKey, isGmailSendingEnabled } from "@/lib/gmail/config";
import { decryptToken, encryptToken } from "@/lib/gmail/crypto";
import {
  GmailAuthRevokedError,
  getMessage,
  listInboxMessageIds,
  refreshAccessToken,
  revokeToken,
  sendRaw,
} from "@/lib/gmail/google";
import { buildReplyMime, parseInbound, replySubject } from "@/lib/gmail/mime";

/**
 * Everything that touches a business's Gmail. Runs with the service-role
 * client, so every function takes the business id and filters by it
 * explicitly; the callers (server actions and the cron) decide which business
 * that is: server actions only ever pass the signed-in member's active
 * business, and the cron walks connections one at a time. The database
 * triggers from 0012 refuse any row that points at another business.
 *
 * Nothing in this file sends email except sendApprovedDraft(), which needs a
 * person's click on one draft AND GMAIL_SENDING_ENABLED=true.
 */

export type Admin = SupabaseClient<Database>;

/** First sync looks back this far; later syncs start a little before the last one. */
const FIRST_SYNC_LOOKBACK_DAYS = 3;
const SYNC_OVERLAP_MINUTES = 10;
const MAX_MESSAGES_PER_SYNC = 25;

export async function saveConnection(
  admin: Admin,
  input: { businessId: string; emailAddress: string; refreshToken: string; scopes: string; userId: string },
): Promise<void> {
  const encrypted = encryptToken(input.refreshToken, getTokenKey());

  const { data: connection, error } = await admin
    .from("gmail_connections")
    .upsert(
      {
        business_id: input.businessId,
        email_address: input.emailAddress,
        status: "connected",
        scopes: input.scopes,
        connected_by: input.userId,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "business_id" },
    )
    .select("id")
    .single();
  if (error || !connection) throw new Error(`Could not save the Gmail connection: ${error?.message}`);

  const { error: secretError } = await admin.from("gmail_connection_secrets").upsert(
    {
      connection_id: connection.id,
      business_id: input.businessId,
      refresh_token_encrypted: encrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (secretError) throw new Error(`Could not store the Gmail token: ${secretError.message}`);
}

async function refreshTokenFor(admin: Admin, connection: GmailConnection): Promise<string> {
  const { data: secret } = await admin
    .from("gmail_connection_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", connection.id)
    .eq("business_id", connection.business_id)
    .maybeSingle();
  if (!secret) throw new GmailAuthRevokedError("no stored token");
  return decryptToken(secret.refresh_token_encrypted, getTokenKey());
}

async function accessTokenFor(admin: Admin, connection: GmailConnection): Promise<string> {
  const config = getGmailOAuthConfig();
  if (!config) throw new Error("Gmail is not configured on the server.");
  try {
    return await refreshAccessToken(config, await refreshTokenFor(admin, connection));
  } catch (cause) {
    if (cause instanceof GmailAuthRevokedError) {
      await admin
        .from("gmail_connections")
        .update({ status: "needs_reconnect", last_error: "Google access was revoked or expired. Reconnect Gmail." })
        .eq("id", connection.id);
    }
    throw cause;
  }
}

export async function getConnection(admin: Admin, businessId: string): Promise<GmailConnection | null> {
  const { data } = await admin
    .from("gmail_connections")
    .select("*")
    .eq("business_id", businessId)
    .neq("status", "disconnected")
    .maybeSingle();
  return data;
}

/** Deletes the token, tells Google to forget it, and keeps the copied emails for history. */
export async function disconnect(admin: Admin, businessId: string): Promise<void> {
  const connection = await getConnection(admin, businessId);
  if (!connection) return;
  try {
    await revokeToken(await refreshTokenFor(admin, connection));
  } catch {
    // Revoking is best effort; the token is deleted below regardless.
  }
  await admin
    .from("gmail_connection_secrets")
    .delete()
    .eq("connection_id", connection.id)
    .eq("business_id", businessId);
  await admin
    .from("gmail_connections")
    .update({ status: "disconnected", last_error: null })
    .eq("id", connection.id)
    .eq("business_id", businessId);
  // Unsent drafts can no longer go anywhere.
  await admin
    .from("email_drafts")
    .update({ status: "discarded" })
    .eq("business_id", businessId)
    .in("status", ["draft", "failed"]);
}

async function findLeadId(admin: Admin, businessId: string, address: string): Promise<string | null> {
  const { data } = await admin
    .from("leads")
    .select("id")
    .eq("business_id", businessId)
    .ilike("email", address.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type SyncResult = { imported: number; drafted: number; error?: string };

/**
 * Copies new inbox mail for one business, matches each sender to its leads,
 * and writes a reply draft for emails from known leads. Idempotent: an email
 * already copied is skipped by its Gmail id.
 */
export async function syncConnection(admin: Admin, connection: GmailConnection): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, drafted: 0 };
  const startedAt = new Date();

  try {
    const accessToken = await accessTokenFor(admin, connection);

    const since = connection.last_synced_at
      ? new Date(new Date(connection.last_synced_at).getTime() - SYNC_OVERLAP_MINUTES * 60_000)
      : new Date(startedAt.getTime() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
    const ids = await listInboxMessageIds(
      accessToken,
      Math.floor(since.getTime() / 1000),
      MAX_MESSAGES_PER_SYNC,
    );

    if (ids.length > 0) {
      const { data: known } = await admin
        .from("email_messages")
        .select("gmail_message_id")
        .eq("connection_id", connection.id)
        .in("gmail_message_id", ids);
      const seen = new Set((known ?? []).map((row) => row.gmail_message_id));

      // Oldest first, so the inbox fills in the order mail arrived.
      for (const id of ids.filter((id) => !seen.has(id)).reverse()) {
        const parsed = parseInbound(await getMessage(accessToken, id));
        if (!parsed || parsed.fromAddress === connection.email_address.toLowerCase()) continue;

        const leadId = await findLeadId(admin, connection.business_id, parsed.fromAddress);
        const { data: saved, error } = await admin
          .from("email_messages")
          .insert({
            business_id: connection.business_id,
            connection_id: connection.id,
            lead_id: leadId,
            direction: "inbound",
            gmail_message_id: parsed.gmailMessageId,
            gmail_thread_id: parsed.gmailThreadId,
            rfc822_message_id: parsed.rfc822MessageId,
            from_address: parsed.fromAddress,
            from_name: parsed.fromName,
            to_address: parsed.toAddress,
            subject: parsed.subject,
            snippet: parsed.snippet,
            body_text: parsed.bodyText,
            received_at: parsed.receivedAt,
          })
          .select("*")
          .single();

        // A unique-key clash means another sync copied it a moment ago.
        if (error || !saved) continue;
        result.imported++;

        if (leadId) {
          await admin.from("lead_activity").insert({
            business_id: connection.business_id,
            lead_id: leadId,
            type: "email_received",
            metadata: { subject: parsed.subject, from: parsed.fromAddress },
          });
        }

        // Only emails from known leads get an automatic draft; anything else
        // waits for a person to ask, so spam and newsletters cost nothing.
        if (leadId && !parsed.isAutomated && isAiConfigured()) {
          const drafted = await createDraftFor(admin, saved).catch(() => false);
          if (drafted) result.drafted++;
        }
      }
    }

    await admin
      .from("gmail_connections")
      .update({ last_synced_at: startedAt.toISOString(), last_error: null, status: "connected" })
      .eq("id", connection.id);
  } catch (cause) {
    result.error = cause instanceof Error ? cause.message : String(cause);
    if (!(cause instanceof GmailAuthRevokedError)) {
      await admin
        .from("gmail_connections")
        .update({ last_error: result.error.slice(0, 500) })
        .eq("id", connection.id);
    }
  }

  return result;
}

/**
 * Writes an AI reply draft for one copied email, using that business's AI
 * settings and, when matched, its lead. Returns false when the AI judged that
 * the email needs no reply or an open draft already exists.
 */
export async function createDraftFor(admin: Admin, message: EmailMessage): Promise<boolean> {
  const businessId = message.business_id;

  const [{ data: business }, { data: settings }, { data: lead }] = await Promise.all([
    admin
      .from("businesses")
      .select("name, business_type, custom_business_type, currency")
      .eq("id", businessId)
      .single(),
    admin.from("business_ai_settings").select("*").eq("business_id", businessId).maybeSingle(),
    message.lead_id
      ? admin
          .from("leads")
          .select("customer_name, service, estimate_amount")
          .eq("id", message.lead_id)
          .eq("business_id", businessId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!business) return false;

  const generated = await generateEmailReply(
    emailReplyInputs({
      business,
      settings,
      lead,
      senderName: message.from_name,
      subject: message.subject,
      body: message.body_text ?? message.snippet ?? "",
    }),
  );
  if (generated.kind === "no_reply") return false;

  const { error } = await admin.from("email_drafts").insert({
    business_id: businessId,
    email_message_id: message.id,
    lead_id: message.lead_id,
    to_address: message.from_address,
    subject: replySubject(message.subject),
    body: generated.body,
    ai_model: generated.model,
    discount_offered: generated.discountOffered,
  });
  // The partial unique index refuses a second open draft for the same email.
  return !error;
}

export type SendOutcome = { ok: true } | { ok: false; error: string };

/**
 * Sends ONE draft that a member just approved. The draft is claimed first
 * (draft/failed -> sending in one conditional update), so a double click or two
 * open tabs can never send it twice.
 */
export async function sendApprovedDraft(
  admin: Admin,
  input: { businessId: string; draftId: string; userId: string },
): Promise<SendOutcome> {
  if (!isGmailSendingEnabled()) {
    return {
      ok: false,
      error: "Sending is switched off for this WinBack environment. Nothing was sent.",
    };
  }

  const connection = await getConnection(admin, input.businessId);
  if (!connection || connection.status !== "connected") {
    return { ok: false, error: "Connect this business's Gmail before sending." };
  }

  const nowIso = new Date().toISOString();
  const { data: draft } = await admin
    .from("email_drafts")
    .update({ status: "sending", approved_by: input.userId, approved_at: nowIso, error: null })
    .eq("id", input.draftId)
    .eq("business_id", input.businessId)
    .in("status", ["draft", "failed"])
    .select("*")
    .maybeSingle();
  if (!draft) return { ok: false, error: "This draft was already sent or discarded." };

  const { data: original } = await admin
    .from("email_messages")
    .select("*")
    .eq("id", draft.email_message_id)
    .eq("business_id", input.businessId)
    .single();

  try {
    if (!original) throw new Error("The original email is gone.");
    const accessToken = await accessTokenFor(admin, connection);
    const raw = buildReplyMime({
      from: connection.email_address,
      to: draft.to_address,
      subject: draft.subject,
      body: draft.body,
      inReplyTo: original.rfc822_message_id,
      references: null,
    });
    const sent = await sendRaw(accessToken, raw, original.gmail_thread_id);

    await admin
      .from("email_drafts")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_gmail_message_id: sent.id })
      .eq("id", draft.id)
      .eq("business_id", input.businessId);

    await admin.from("email_messages").insert({
      business_id: input.businessId,
      connection_id: connection.id,
      lead_id: draft.lead_id,
      direction: "outbound",
      gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId,
      from_address: connection.email_address,
      to_address: draft.to_address,
      subject: draft.subject,
      body_text: draft.body,
      received_at: new Date().toISOString(),
    });

    if (draft.lead_id) {
      await admin.from("lead_activity").insert({
        business_id: input.businessId,
        lead_id: draft.lead_id,
        type: "email_sent",
        metadata: { subject: draft.subject, to: draft.to_address },
        created_by: input.userId,
      });
    }
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await admin
      .from("email_drafts")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", draft.id)
      .eq("business_id", input.businessId);
    return { ok: false, error: "Gmail did not accept the email. Nothing was sent; you can try again." };
  }
}
