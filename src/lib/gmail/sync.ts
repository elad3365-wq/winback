import "server-only";

import { getMessage, listInboxMessages } from "@/lib/gmail/api";
import { getAccessToken } from "@/lib/gmail/connection";
import { parseMessage } from "@/lib/gmail/parse";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pull recent INBOX messages for a business's connected mailbox and store any
 * not seen before. Messages are written with the SERVICE ROLE (users have no
 * INSERT on this table — they cannot forge inbound/outbound mail), so this must
 * only be called after the caller has authorized the business. Idempotent: the
 * unique (business_id, gmail_message_id) constraint means a message is stored at
 * most once even under a race — a duplicate insert is counted as skipped.
 */

export type SyncResult = { fetched: number; stored: number; skipped: number };

export async function syncInbox(businessId: string, opts: { maxResults?: number } = {}): Promise<SyncResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Inbox sync requires SUPABASE_SERVICE_ROLE_KEY to be configured.");

  const accessToken = await getAccessToken(businessId);
  const list = await listInboxMessages(accessToken, { maxResults: opts.maxResults ?? 25 });
  const ids = (list.messages ?? []).map((m) => m.id);

  let stored = 0;
  let skipped = 0;

  for (const id of ids) {
    const { data: existing } = await db
      .from("business_email_messages")
      .select("id")
      .eq("business_id", businessId)
      .eq("gmail_message_id", id)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const parsed = parseMessage(await getMessage(accessToken, id, "full"));
    const { error } = await db.from("business_email_messages").insert({
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
    });
    if (error) skipped++; // unique violation = a concurrent sync already stored it
    else stored++;
  }

  return { fetched: ids.length, stored, skipped };
}
