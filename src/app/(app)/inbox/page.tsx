import Link from "next/link";

import { InboxList, type InboxItem } from "@/components/inbox/inbox-list";
import { SyncButton } from "@/components/inbox/sync-button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { requireBusinessContext } from "@/lib/business";
import { isGmailSendingEnabled } from "@/lib/gmail/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Inbox · WinBack",
};

export default async function InboxPage() {
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  // Every read here goes through RLS and is filtered to the active business.
  const [{ data: connection }, { data: messages }, { data: drafts }, { data: leads }] = await Promise.all([
    supabase
      .from("gmail_connections")
      .select("email_address, status, last_synced_at")
      .eq("business_id", business.id)
      .neq("status", "disconnected")
      .maybeSingle(),
    supabase
      .from("email_messages")
      .select("*")
      .eq("business_id", business.id)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("email_drafts")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("leads")
      .select("id, customer_name, service")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const leadNames = new Map((leads ?? []).map((lead) => [lead.id, lead.customer_name]));
  const items: InboxItem[] = (messages ?? []).map((message) => {
    const forMessage = (drafts ?? []).filter((draft) => draft.email_message_id === message.id);
    const open = forMessage.find((draft) => ["draft", "failed", "sending"].includes(draft.status)) ?? null;
    const sent = forMessage.find((draft) => draft.status === "sent") ?? null;
    return {
      message,
      leadName: message.lead_id ? (leadNames.get(message.lead_id) ?? null) : null,
      draft: open,
      sent,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            Customer emails to <span className="font-medium text-slate-700">{business.name}</span>
            {connection ? ` (${connection.email_address})` : ""}, with AI reply drafts you approve one by one.
          </p>
        </div>
        {connection ? <SyncButton /> : null}
      </header>

      {!connection ? (
        <Card>
          <p className="text-sm text-slate-600">
            This business hasn&apos;t connected Gmail yet.{" "}
            <Link href="/settings/email" className="font-medium text-indigo-700 hover:underline">
              Connect Gmail
            </Link>
          </p>
        </Card>
      ) : connection.status === "needs_reconnect" ? (
        <Alert tone="error">
          Google no longer accepts this inbox connection.{" "}
          <Link href="/settings/email" className="font-medium underline">
            Reconnect Gmail
          </Link>
        </Alert>
      ) : null}

      {connection && !isGmailSendingEnabled() ? (
        <Alert tone="info">
          Sending is switched off on this environment. You can review and edit drafts; nothing will be sent.
        </Alert>
      ) : null}

      {connection ? (
        <InboxList items={items} leads={(leads ?? []).map((lead) => ({ id: lead.id, name: lead.customer_name, service: lead.service }))} />
      ) : null}
    </div>
  );
}
