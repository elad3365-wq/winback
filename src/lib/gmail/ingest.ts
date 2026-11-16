import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueTask } from "@/lib/ai/autopilot/store";
import { dedupeKey } from "@/lib/ai/autopilot/supervisor";
import { getMessage } from "@/lib/gmail/api";
import { parseMessage } from "@/lib/gmail/parse";
import type { Database } from "@/lib/database.types";

/**
 * Store ONE Gmail message (if new) and enqueue AI work for it. Shared by the
 * manual inbox sync and the push/history path so both apply the same loop- and
 * duplicate-prevention rules:
 *   - idempotent on (business_id, gmail_message_id) — stored at most once,
 *   - never ingest the mailbox's OWN outbound mail (SENT/DRAFT label, or the
 *     From address is the connected mailbox) — this is what stops an AI reply
 *     from waking the AI again in a loop,
 *   - writes go through the SERVICE ROLE (users can't forge messages).
 * Returns what happened so callers can report counts.
 */

type Db = SupabaseClient<Database>;

export type IngestOutcome = "stored" | "skipped" | "self";

export async function ingestMessage(
  db: Db,
  businessId: string,
  accessToken: string,
  gmailMessageId: string,
  mailboxEmail: string | null,
): Promise<IngestOutcome> {
  const { data: existing } = await db
    .from("business_email_messages")
    .select("id")
    .eq("business_id", businessId)
    .eq("gmail_message_id", gmailMessageId)
    .maybeSingle();
  if (existing) return "skipped";

  const parsed = parseMessage(await getMessage(accessToken, gmailMessageId, "full"));

  // Loop prevention: our own sent/draft mail must never become an inbound event.
  const labels = parsed.labelIds ?? [];
  if (labels.includes("SENT") || labels.includes("DRAFT")) return "self";
  if (mailboxEmail && parsed.fromAddress && parsed.fromAddress === mailboxEmail.trim().toLowerCase()) {
    return "self";
  }

  const { data: inserted, error } = await db
    .from("business_email_messages")
    .insert({
      business_id: businessId,
      gmail_message_id: parsed.id,
      gmail_thread_id: parsed.threadId,
      direction: "inbound",
      from_address: parsed.fromAddress,
      to_addresses: parsed.to,
      subject: parsed.subject,
      snippet: parsed.snippet,
      body_text: parsed.bodyText,
      rfc822_message_id: parsed.rfc822MessageId,
      in_reply_to: parsed.inReplyTo,
      email_references: parsed.references,
      internal_date: parsed.date,
      label_ids: parsed.labelIds,
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted) return "skipped"; // unique violation = concurrent ingest

  // Hand the new inbound message to the AI Autopilot queue (idempotent per
  // message). Best-effort: the message is stored even if enqueue fails.
  try {
    await enqueueTask({
      businessId,
      type: "inbound_email",
      dedupeKey: dedupeKey({ businessId, type: "inbound_email", entityId: inserted.id }),
      payload: { messageId: inserted.id },
      priority: 70,
      leadId: null,
    });
  } catch {
    // non-fatal
  }
  return "stored";
}
