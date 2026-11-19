"use client";

import Link from "next/link";
import { useState } from "react";

import {
  approveAiMessageAction,
  cancelAiMessageAction,
  markAiMessageSentManuallyAction,
  reopenAiMessageAction,
  saveAiMessageEditAction,
} from "@/app/(app)/leads/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { smsHref } from "@/lib/ai/manual-send";
import type { ReviewFlag } from "@/lib/ai/review";
import type { Lead } from "@/lib/database.types";

type Channel = "sms" | "email";
type Status = "draft" | "edited" | "approved" | "sent";

/** The lead's latest open AI message, so a reload doesn't lose the draft. */
export type InitialAiMessage = {
  id: string;
  message: string;
  channel: Channel;
  status: Status;
  approvedAt: string | null;
  flags: ReviewFlag[];
};

type GenerateResponse = {
  id: string;
  message: string;
  channel: Channel;
  discountOffered: boolean;
  flags?: ReviewFlag[];
  createdAt: string;
};

/**
 * AI follow-up, human-in-the-loop:
 *   Generate → review (flags) → edit → Approve → copy / open in Messages →
 *   Mark as sent.
 * WinBack never sends anything from here. Works without Gmail: the owner sends
 * the approved text from their own phone or email and records it.
 */
export function AiFollowup({ lead, initial }: { lead: Lead; initial?: InitialAiMessage | null }) {
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? "sms");
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null);
  const [content, setContent] = useState(initial?.message ?? "");
  const [savedContent, setSavedContent] = useState(initial?.message ?? "");
  const [status, setStatus] = useState<Status | null>(initial?.status ?? null);
  const [approvedAt, setApprovedAt] = useState<string | null>(initial?.approvedAt ?? null);
  const [flags, setFlags] = useState<ReviewFlag[]>(initial?.flags ?? []);

  const [pending, setPending] = useState<
    null | "generate" | "save" | "approve" | "reopen" | "discard" | "sent"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const busy = pending !== null;
  const unsubscribed = lead.unsubscribe_status === "unsubscribed";
  const isApproved = status === "approved";
  const isSent = status === "sent";
  const isLocked = isApproved || isSent;
  const isDirty = content.trim() !== savedContent.trim();
  const smsLink = isApproved && channel === "sms" ? smsHref(lead.phone, content) : null;

  function resetDraft() {
    setDraftId(null);
    setContent("");
    setSavedContent("");
    setStatus(null);
    setApprovedAt(null);
    setFlags([]);
  }

  async function generate() {
    setPending("generate");
    setError(null);
    setNotice(null);
    setCopied(false);
    try {
      // Regenerating replaces the open draft: cancel it so it never lingers as
      // an unreviewed draft in history.
      if (draftId && !isLocked) await cancelAiMessageAction(draftId);
      const response = await fetch(`/api/leads/${lead.id}/ai-followup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<GenerateResponse> & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDraftId(data.id ?? null);
      setContent(data.message ?? "");
      setSavedContent(data.message ?? "");
      setStatus("draft");
      setApprovedAt(null);
      setFlags(Array.isArray(data.flags) ? data.flags : []);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function saveEdit(): Promise<boolean> {
    if (!draftId) return false;
    setPending("save");
    setError(null);
    try {
      const result = await saveAiMessageEditAction(draftId, content);
      if (result.error) {
        setError(result.error);
        return false;
      }
      setSavedContent(content.trim());
      setStatus(result.status === "approved" ? "approved" : "edited");
      return true;
    } finally {
      setPending(null);
    }
  }

  async function approve() {
    if (!draftId) return;
    setError(null);
    // Persist any unsaved edits so the approved text is exactly what's on screen.
    if (isDirty) {
      const saved = await saveEdit();
      if (!saved) return;
    }
    setPending("approve");
    try {
      const result = await approveAiMessageAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("approved");
      setApprovedAt(result.approvedAt ?? new Date().toISOString());
    } finally {
      setPending(null);
    }
  }

  async function reopen() {
    if (!draftId) return;
    setError(null);
    setPending("reopen");
    try {
      const result = await reopenAiMessageAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("draft");
      setApprovedAt(null);
    } finally {
      setPending(null);
    }
  }

  async function discard() {
    if (!draftId) return;
    setError(null);
    setPending("discard");
    try {
      const result = await cancelAiMessageAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      resetDraft();
      setNotice("Draft discarded. Nothing was sent.");
    } finally {
      setPending(null);
    }
  }

  async function markSent() {
    if (!draftId) return;
    setError(null);
    setPending("sent");
    try {
      const result = await markAiMessageSentManuallyAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("sent");
      setNotice("Recorded as sent and logged as a contact on this lead.");
    } finally {
      setPending(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select the text and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">AI follow-up</h3>
        <p className="mt-1 text-sm text-slate-500">
          Draft, review and approve a follow-up for{" "}
          <span className="font-medium text-slate-700">{lead.customer_name}</span> about{" "}
          <span className="font-medium text-slate-700">{lead.service}</span>. WinBack never sends it
          for you — copy the approved message into your phone or email, then mark it as sent.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          The AI only uses the estimate, your Settings and your{" "}
          <Link href="/settings/knowledge" className="font-medium text-indigo-600 hover:text-indigo-500">
            knowledge base
          </Link>{" "}
          — add prices and policies there so it can mention them.
        </p>
      </div>

      {unsubscribed ? (
        <Alert tone="info">This customer unsubscribed, so AI follow-ups are turned off for them.</Alert>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-40">
            <Field label="Channel" htmlFor="ai-channel">
              <Select
                id="ai-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
                disabled={busy || isLocked}
              >
                <option value="sms">Text message</option>
                <option value="email">Email</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isApproved ? (
              <Button onClick={generate} disabled={busy}>
                {pending === "generate"
                  ? "Generating…"
                  : status && !isSent
                    ? "Regenerate"
                    : "Generate AI Follow-up"}
              </Button>
            ) : null}
            {status ? (
              <Button variant="secondary" onClick={copy} disabled={busy || !content.trim()}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {status ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <StatusPill status={status} />
            {isApproved && approvedAt ? (
              <span className="text-xs text-slate-500">
                Approved {new Date(approvedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {flags.length > 0 && !isSent ? (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
            >
              <p className="font-medium">Check before sending</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {flags.map((flag, index) => (
                  <li key={`${flag.kind}-${index}`}>{flag.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Field
            label="Message"
            htmlFor="ai-message"
            hint={
              isSent
                ? "Sent manually. Generate a new follow-up when you're ready."
                : isApproved
                  ? "Approved and locked. Reopen to make changes."
                  : "Edit anything, then Approve."
            }
          >
            <Textarea
              id="ai-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={channel === "email" ? 7 : 4}
              readOnly={isLocked}
              className={isLocked ? "bg-slate-50 text-slate-600" : undefined}
            />
          </Field>

          {isApproved ? (
            <div className="flex flex-wrap items-center gap-2">
              {smsLink ? (
                <a
                  href={smsLink}
                  className={buttonClasses("secondary")}
                >
                  Open in Messages
                </a>
              ) : null}
              <Button onClick={markSent} disabled={busy}>
                {pending === "sent" ? "Saving…" : "I sent it — mark as sent"}
              </Button>
              <Button variant="secondary" onClick={reopen} disabled={busy}>
                {pending === "reopen" ? "Reopening…" : "Edit / revise"}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={busy}>
                {pending === "discard" ? "Discarding…" : "Discard"}
              </Button>
            </div>
          ) : isSent ? null : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void saveEdit()} disabled={busy || !isDirty}>
                {pending === "save" ? "Saving…" : "Save changes"}
              </Button>
              <Button onClick={approve} disabled={busy || !content.trim()}>
                {pending === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={busy}>
                {pending === "discard" ? "Discarding…" : "Discard"}
              </Button>
            </div>
          )}
        </div>
      ) : unsubscribed ? null : (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          {pending === "generate"
            ? "Writing a follow-up…"
            : "Click Generate to draft a follow-up message for this lead."}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    draft: "bg-slate-100 text-slate-700 ring-slate-200",
    edited: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    sent: "bg-sky-50 text-sky-700 ring-sky-200",
  };
  const labels: Record<Status, string> = {
    draft: "Draft",
    edited: "Edited draft",
    approved: "Approved",
    sent: "Sent manually",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
