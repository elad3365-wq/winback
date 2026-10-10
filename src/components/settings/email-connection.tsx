"use client";

import { useState, useTransition } from "react";

import { disconnectGmailAction, syncInboxAction } from "@/app/(app)/settings/email/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ConnectionStatus } from "@/lib/gmail/connection";

const ERROR_LABELS: Record<string, string> = {
  invalid_state: "The connection link expired. Please try connecting again.",
  session_mismatch: "You were signed in as a different user. Sign in and retry.",
  not_owner: "Only the business owner can connect the mailbox.",
  exchange_failed: "Google rejected the connection. Please try again.",
  access_denied: "You declined the Google permission request.",
};

export function EmailConnection({
  status,
  connectError,
  justConnected,
}: {
  status: ConnectionStatus;
  connectError: string | null;
  justConnected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(
    justConnected
      ? { tone: "success", text: "Gmail connected." }
      : connectError
        ? { tone: "error", text: ERROR_LABELS[connectError] ?? "Could not connect Gmail." }
        : null,
  );

  function runSync() {
    startTransition(async () => {
      const result = await syncInboxAction();
      setNotice(
        result.error
          ? { tone: "error", text: result.error }
          : { tone: "success", text: `Synced. ${result.data?.stored ?? 0} new, ${result.data?.skipped ?? 0} already saved.` },
      );
    });
  }

  function runDisconnect() {
    if (!confirm("Disconnect this Gmail account? WinBack will stop reading new email for this business.")) return;
    startTransition(async () => {
      const result = await disconnectGmailAction();
      setNotice(result.error ? { tone: "error", text: result.error } : { tone: "success", text: "Disconnected." });
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Gmail connection</h2>
          {status.connected ? (
            <p className="mt-1 text-sm text-slate-600">
              Connected as <span className="font-medium text-slate-900">{status.email}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">No mailbox connected yet.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status.connected ? (
            <>
              <Button type="button" variant="secondary" onClick={runSync} disabled={pending}>
                {pending ? "Working…" : "Sync inbox"}
              </Button>
              <Button type="button" variant="ghost" onClick={runDisconnect} disabled={pending}>
                Disconnect
              </Button>
            </>
          ) : (
            // A full navigation (not fetch) so the browser follows Google's redirect.
            <a
              href="/api/gmail/connect"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Connect Gmail
            </a>
          )}
        </div>
      </div>
      {notice ? (
        <div className="px-5 pb-5">
          <Alert tone={notice.tone === "success" ? "success" : "error"}>{notice.text}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
