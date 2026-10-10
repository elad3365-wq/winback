"use client";

import { useState, useTransition } from "react";

import {
  approveReplyAction,
  cancelReplyAction,
  generateReplyAction,
  linkMessageToLeadAction,
  saveReplyEditAction,
  sendReplyAction,
} from "@/app/(app)/settings/email/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/field";
import type { GmailReplyStatus } from "@/lib/database.types";

export type InboxItem = {
  message: {
    id: string;
    fromAddress: string | null;
    subject: string | null;
    snippet: string | null;
    bodyText: string | null;
    internalDate: string | null;
    leadId: string | null;
  };
  reply: { id: string; status: GmailReplyStatus; body: string } | null;
};

type LeadOption = { id: string; name: string };

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function MessageRow({ item, leads }: { item: InboxItem; leads: LeadOption[] }) {
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState(item.reply);
  const [body, setBody] = useState(item.reply?.body ?? "");
  const [leadId, setLeadId] = useState(item.message.leadId ?? "");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const msg = item.message;
  const status = reply?.status ?? null;
  const editable = status === null || status === "draft" || status === "edited";

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>, onOk?: () => void, okText?: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.error) setNotice({ tone: "error", text: result.error });
      else {
        setNotice(okText ? { tone: "success", text: okText } : null);
        onOk?.();
      }
    });
  }

  return (
    <Card>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{msg.subject || "(no subject)"}</p>
            <p className="truncate text-xs text-slate-500">
              From {msg.fromAddress ?? "unknown"} · {when(msg.internalDate)}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Lead
            <Select
              value={leadId}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value;
                setLeadId(next);
                run(() => linkMessageToLeadAction(msg.id, next || null), undefined, "Linked.");
              }}
            >
              <option value="">— none —</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {msg.snippet ? <p className="text-sm text-slate-600">{msg.snippet}</p> : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          {status === "sent" ? (
            <>
              <p className="mb-2 text-xs font-medium text-emerald-700">Reply sent</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{body}</p>
            </>
          ) : reply ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  AI reply draft{status === "approved" ? " · approved" : ""}
                </span>
              </div>
              <Textarea
                value={body}
                rows={5}
                disabled={!editable || pending}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {editable ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        run(() => saveReplyEditAction(reply.id, body), () => setReply({ ...reply, status: "edited", body }), "Saved.")
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => approveReplyAction(reply.id), () => setReply({ ...reply, status: "approved", body }), "Approved.")
                      }
                    >
                      Approve
                    </Button>
                  </>
                ) : null}
                {status === "approved" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => sendReplyAction(reply.id), () => setReply({ ...reply, status: "sent", body }), "Sent.")}
                  >
                    Send reply
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => cancelReplyAction(reply.id), () => setReply(null), "Discarded.")}
                >
                  Discard
                </Button>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const result = await generateReplyAction(msg.id);
                    if (result.data?.replyId) {
                      // We don't have the generated body client-side; reload to show it.
                      window.location.reload();
                    }
                    return result;
                  },
                  undefined,
                )
              }
            >
              {pending ? "Generating…" : "Generate AI reply"}
            </Button>
          )}
        </div>

        {notice ? <Alert tone={notice.tone === "success" ? "success" : "error"}>{notice.text}</Alert> : null}
      </div>
    </Card>
  );
}

export function EmailInbox({ items, leads }: { items: InboxItem[]; leads: LeadOption[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <p className="p-5 text-sm text-slate-500">
          No emails yet. Click <span className="font-medium">Sync inbox</span> above to pull recent messages.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MessageRow key={item.message.id} item={item} leads={leads} />
      ))}
    </div>
  );
}
