import Link from "next/link";

import { EmailConnection } from "@/components/settings/email-connection";
import { EmailInbox, type InboxItem } from "@/components/settings/email-inbox";
import { Card } from "@/components/ui/card";
import { requireOnboardedContext } from "@/lib/business";
import type { BusinessEmailReply } from "@/lib/database.types";
import { isGmailFeatureEnabled } from "@/lib/gmail/config";
import { getConnectionStatus } from "@/lib/gmail/connection";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email · WinBack" };

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const { business } = await requireOnboardedContext();
  const sp = await searchParams;

  if (!isGmailFeatureEnabled()) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Email</h1>
          <p className="mt-1 text-sm text-slate-500">Connect your business inbox so WinBack can draft replies for you.</p>
        </header>
        <Card>
          <div className="p-5 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Gmail is not enabled yet.</p>
            <p className="mt-1">
              This feature is turned off in this environment. An administrator enables it by setting{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">WINBACK_GMAIL_ENABLED=true</code> and the Google
              OAuth / encryption variables. See the setup checklist.
            </p>
            <Link href="/settings" className="mt-3 inline-block font-medium text-indigo-600 hover:text-indigo-500">
              Back to settings
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const status = await getConnectionStatus(supabase, business.id);

  const [{ data: messages }, { data: leads }] = await Promise.all([
    supabase
      .from("business_email_messages")
      .select("*")
      .eq("business_id", business.id)
      .eq("direction", "inbound")
      .order("internal_date", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("leads")
      .select("id, customer_name")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const messageIds = (messages ?? []).map((m) => m.id);
  let repliesByMessage = new Map<string, BusinessEmailReply>();
  if (messageIds.length > 0) {
    const { data: replies } = await supabase
      .from("business_email_replies")
      .select("*")
      .eq("business_id", business.id)
      .in("message_id", messageIds)
      .order("created_at", { ascending: false });
    // Latest non-cancelled reply per message.
    repliesByMessage = new Map();
    for (const r of replies ?? []) {
      if (r.status === "cancelled") continue;
      if (!repliesByMessage.has(r.message_id)) repliesByMessage.set(r.message_id, r);
    }
  }

  const items: InboxItem[] = (messages ?? []).map((m) => ({
    message: {
      id: m.id,
      fromAddress: m.from_address,
      subject: m.subject,
      snippet: m.snippet,
      bodyText: m.body_text,
      internalDate: m.internal_date,
      leadId: m.lead_id,
    },
    reply: repliesByMessage.get(m.id)
      ? {
          id: repliesByMessage.get(m.id)!.id,
          status: repliesByMessage.get(m.id)!.status,
          body: repliesByMessage.get(m.id)!.body,
        }
      : null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Email</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your business inbox. WinBack drafts replies for you to review — nothing is ever sent without your approval.
        </p>
      </header>

      <EmailConnection
        status={status}
        connectError={typeof sp.gmail_error === "string" ? sp.gmail_error : null}
        justConnected={sp.gmail_connected === "1"}
      />

      {status.connected ? (
        <EmailInbox items={items} leads={(leads ?? []).map((l) => ({ id: l.id, name: l.customer_name }))} />
      ) : null}
    </div>
  );
}
