import Link from "next/link";

import { connectGmailAction, disconnectGmailAction } from "@/app/(app)/settings/email/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireBusinessContext } from "@/lib/business";
import { GMAIL_SCOPES, gmailSetupProblems, isGmailSendingEnabled } from "@/lib/gmail/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Email · WinBack",
};

const RESULTS: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  connected: { tone: "success", text: "Gmail is connected. WinBack will copy new customer emails into the Inbox." },
  connected_read_only: {
    tone: "info",
    text: "Gmail is connected for reading only, because sending wasn't allowed on Google's screen. Reconnect and tick both boxes to send approved replies.",
  },
  disconnected: { tone: "info", text: "Gmail is disconnected. WinBack no longer has access to this inbox." },
  cancelled: { tone: "info", text: "Gmail wasn't connected: the Google screen was closed or declined." },
  expired: { tone: "error", text: "That Gmail connection attempt expired. Please try again." },
  not_member: { tone: "error", text: "You're no longer a member of that business, so nothing was connected." },
  not_configured: { tone: "error", text: "Gmail isn't set up on this WinBack environment yet." },
  missing_read: {
    tone: "error",
    text: "Gmail wasn't connected because reading email wasn't allowed. Try again and tick the read box.",
  },
  google_error: { tone: "error", text: "Google refused the connection. Please try again." },
  failed: { tone: "error", text: "Connecting Gmail failed. Nothing was saved. Please try again." },
};

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const { gmail } = await searchParams;
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  // Read through RLS: only members of this business can see its connection.
  const { data: connection } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("business_id", business.id)
    .neq("status", "disconnected")
    .maybeSingle();

  const problems = gmailSetupProblems();
  const sendingEnabled = isGmailSendingEnabled();
  const result = gmail ? RESULTS[gmail] : undefined;
  const canSend = connection?.scopes?.split(/\s+/).includes(GMAIL_SCOPES[1]) ?? false;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Email</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect the Gmail inbox of <span className="font-medium text-slate-700">{business.name}</span>.
          Each business connects its own inbox; your other businesses are not affected.
        </p>
      </header>

      {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}

      <Card className="space-y-4">
        {connection ? (
          <>
            <div>
              <p className="text-sm text-slate-500">Connected inbox</p>
              <p className="text-base font-semibold text-slate-900">{connection.email_address}</p>
              <p className="mt-1 text-xs text-slate-500">
                {connection.last_synced_at
                  ? `Last checked ${new Date(connection.last_synced_at).toLocaleString()}`
                  : "Not checked yet"}
              </p>
            </div>
            {connection.status === "needs_reconnect" ? (
              <Alert tone="error">Google no longer accepts this connection. Reconnect Gmail to keep receiving email.</Alert>
            ) : connection.last_error ? (
              <Alert tone="error">The last check failed: {connection.last_error}</Alert>
            ) : null}
            {!canSend ? (
              <Alert tone="info">This connection can read email but not send. Reconnect to allow sending.</Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <form action={connectGmailAction}>
                <Button type="submit" variant="secondary" disabled={problems.length > 0}>
                  Reconnect Gmail
                </Button>
              </form>
              <form action={disconnectGmailAction}>
                <Button type="submit" variant="danger">
                  Disconnect
                </Button>
              </form>
              <Link
                href="/inbox"
                className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Open Inbox
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              WinBack asks Google for two things only: to read this inbox, and to send the replies
              you approve one by one. It never sends anything on its own.
            </p>
            <form action={connectGmailAction}>
              <Button type="submit" disabled={problems.length > 0}>
                Connect Gmail
              </Button>
            </form>
          </>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">How replies work</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>New emails are copied in when you press Check for new email in the Inbox, and on a daily schedule.</li>
          <li>Emails from your leads get an AI reply draft, written with this business&apos;s AI settings.</li>
          <li>Nothing is sent until someone in this business presses Approve and send on that one draft.</li>
          <li>
            Sending on this environment is{" "}
            <span className="font-medium text-slate-800">{sendingEnabled ? "on" : "off"}</span>
            {sendingEnabled ? "." : ", so approved drafts stay unsent until the owner switches it on."}
          </li>
        </ul>
      </Card>

      {problems.length > 0 ? (
        <Alert tone="info">
          Gmail is not set up on this environment yet. Missing server settings: {problems.join(", ")}.
        </Alert>
      ) : null}
    </div>
  );
}
