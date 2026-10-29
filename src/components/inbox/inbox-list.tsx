"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  approveAndSendDraftAction,
  discardDraftAction,
  draftReplyAction,
  linkEmailToLeadAction,
  saveDraftAction,
} from "@/app/(app)/inbox/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/field";
import type { EmailDraft, EmailMessage } from "@/lib/database.types";

export type InboxItem = {
  message: EmailMessage;
  leadName: string | null;
  draft: EmailDraft | null;
  sent: EmailDraft | null;
};

type LeadOption = { id: string; name: string; service: string };

export function InboxList({ items, leads }: { items: InboxItem[]; leads: LeadOption[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          No customer emails yet. Press Check for new email after a customer writes to this inbox.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <InboxCard key={`${item.message.id}:${item.draft?.id ?? ""}`} item={item} leads={leads} />
      ))}
    </div>
  );
}

function InboxCard({ item, leads }: { item: InboxItem; leads: LeadOption[] }) {
  const { message, draft, sent } = item;
  const [body, setBody] = useState(draft?.body ?? "");
  const [savedBody, setSavedBody] = useState(draft?.body ?? "");
  const [leadId, setLeadId] = useState("");
  const [error, setError] = useState<string | null>(
    draft?.status === "failed" ? "The last send failed. Nothing was sent; you can try again." : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const result = await work();
      if (result.error) setError(result.error);
      else if (result.message) setInfo(result.message);
    });

  const dirty = body.trim() !== savedBody.trim();

  function approveAndSend() {
    if (!draft) return;
    if (!window.confirm(`Send this reply to ${draft.to_address} from your Gmail now?`)) return;
    run(async () => {
      // Send exactly what is on screen: save any edit first.
      if (dirty) {
        const saved = await saveDraftAction(draft.id, body);
        if (saved.error) return saved;
        setSavedBody(body.trim());
      }
      return approveAndSendDraftAction(draft.id);
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {message.from_name ? `${message.from_name} ` : ""}
            <span className="font-normal text-slate-500">&lt;{message.from_address}&gt;</span>
          </p>
          <p className="truncate text-sm text-slate-700">{message.subject || "(no subject)"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {message.lead_id ? (
            <Link href={`/leads/${message.lead_id}`} className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
              Lead: {item.leadName ?? "open"}
            </Link>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Not a lead</span>
          )}
          <span>{new Date(message.received_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {expanded ? message.body_text ?? message.snippet : (message.body_text ?? message.snippet ?? "").slice(0, 400)}
        {(message.body_text?.length ?? 0) > 400 ? (
          <button
            type="button"
            className="ml-1 text-xs font-medium text-indigo-700"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      {!message.lead_id && leads.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            aria-label="Link this sender to a lead"
            value={leadId}
            onChange={(event) => setLeadId(event.target.value)}
            disabled={pending}
            className="sm:max-w-xs"
          >
            <option value="">Link sender to a lead…</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name} ({lead.service})
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            disabled={!leadId || pending}
            onClick={() => run(() => linkEmailToLeadAction(message.id, leadId))}
          >
            Link
          </Button>
        </div>
      ) : null}

      {sent ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="text-xs font-medium">Reply sent {sent.sent_at ? new Date(sent.sent_at).toLocaleString() : ""}</p>
          <p className="mt-1 whitespace-pre-wrap">{sent.body}</p>
        </div>
      ) : null}

      {draft && draft.status !== "sending" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">
            AI reply draft to {draft.to_address}
            {draft.discount_offered ? " · mentions a discount" : ""}
            {draft.status === "failed" ? " · last send failed" : ""}
          </p>
          <Textarea
            rows={7}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={pending}
            aria-label="Reply draft"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={approveAndSend} disabled={pending || !body.trim()}>
              {pending ? "Working…" : "Approve and send"}
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !dirty}
              onClick={() =>
                run(async () => {
                  const result = await saveDraftAction(draft.id, body);
                  if (!result.error) setSavedBody(body.trim());
                  return result.error ? result : { message: "Draft saved." };
                })
              }
            >
              Save edit
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => discardDraftAction(draft.id))}>
              Discard
            </Button>
          </div>
        </div>
      ) : draft?.status === "sending" ? (
        <p className="text-xs text-slate-500">Sending…</p>
      ) : !sent ? (
        <Button variant="secondary" disabled={pending} onClick={() => run(() => draftReplyAction(message.id))}>
          {pending ? "Writing…" : "Draft a reply with AI"}
        </Button>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}
    </Card>
  );
}
