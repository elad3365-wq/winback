import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getMessage, listInboxMessages } from "@/lib/gmail/api";
import { getAccessToken } from "@/lib/gmail/connection";
import { parseMessage } from "@/lib/gmail/parse";

/**
 * Pull recent INBOX messages for a business's connected mailbox and store any
 * not seen before. Idempotent: the unique (business_id, gmail_message_id)
 * constraint means a message is stored at most once even under a race — a
 * duplicate insert is counted as skipped, never an error. RLS scopes every
 * write to the caller's business.
 */

type Db = SupabaseClient<Database>;

export type SyncResult = { fetched: number; stored: number; skipped: number };

export async function syncInbox(
  supabase: Db,
  businessId: string,
  opts: { maxResults?: number } = {},
): Promise<SyncResult> {
  const accessToken = await getAccessToken(supabase, businessId);
  const list = await listInboxMessages(accessToken, { maxResults: opts.maxResults ?? 25 });
  const ids = (list.messages ?? []).map((m) => m.id);

  let stored = 0;
  let skipped = 0;

  for (const id of ids) {
    const { data: existing } = await supabase
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
    const { error } = await supabase.from("business_email_messages").insert({
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
    // A unique-violation here means a concurrent sync already stored it.
    if (error) skipped++;
    else stored++;
  }

  return { fetched: ids.length, stored, skipped };
}
