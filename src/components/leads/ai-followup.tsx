"use client";

import { useState } from "react";

import {
  approveAiMessageAction,
  reopenAiMessageAction,
  saveAiMessageEditAction,
} from "@/app/(app)/leads/ai-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import type { Lead } from "@/lib/database.types";

type Channel = "sms" | "email";
type Status = "draft" | "edited" | "approved";

type GenerateResponse = {
  id: string;
  content: string;
  channel: Channel;
  discountOffered: boolean;
  createdAt: string;
};

/**
 * AI follow-up with the draft -> approved -> sent workflow.
 *
 * Generate produces a draft, which the owner can edit, regenerate, copy, and
 * then explicitly Approve. Approval locks the text and records who/when.
 * Sending is not built yet, so the Send button is present but disabled — a
 * message never leaves WinBack from here.
 */
export function AiFollowup({ lead }: { lead: Lead }) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const busy = generating || saving || approving || reopening;
  const isApproved = status === "approved";
  const isDirty = content.trim() !== savedContent.trim();

  async function generate() {
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
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
      setContent(data.content ?? "");
      setSavedContent(data.content ?? "");
      setStatus("draft");
      setApprovedAt(null);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveEdit(): Promise<boolean> {
    if (!draftId) return false;
    setSaving(true);
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
      setSaving(false);
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
    setApproving(true);
    try {
      const result = await approveAiMessageAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("approved");
      setApprovedAt(result.approvedAt ?? new Date().toISOString());
    } finally {
      setApproving(false);
    }
  }

  async function reopen() {
    if (!draftId) return;
    setError(null);
    setReopening(true);
    try {
      const result = await reopenAiMessageAction(draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("draft");
      setApprovedAt(null);
    } finally {
      setReopening(false);
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
          <span className="font-medium text-slate-700">{lead.service}</span>. Sending isn&apos;t
          enabled yet — approved messages are ready for a future send step.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <Field label="Channel" htmlFor="ai-channel">
            <Select
              id="ai-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as Channel)}
              disabled={busy || isApproved}
            >
              <option value="sms">Text message</option>
              <option value="email">Email</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={busy}>
            {generating ? "Generating…" : status ? "Regenerate" : "Generate AI Follow-up"}
          </Button>
          {status ? (
            <Button variant="secondary" onClick={copy} disabled={busy || !content.trim()}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

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

          <Field
            label="Message"
            htmlFor="ai-message"
            hint={
              isApproved
                ? "Approved and locked. Reopen to make changes."
                : "Edit anything, then Save and Approve."
            }
          >
            <Textarea
              id="ai-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={channel === "email" ? 7 : 4}
              readOnly={isApproved}
              className={isApproved ? "bg-slate-50 text-slate-600" : undefined}
            />
          </Field>

          {isApproved ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={reopen} disabled={busy}>
                {reopening ? "Reopening…" : "Edit / revise"}
              </Button>
              {/* Sending is intentionally disabled until the send phase ships. */}
              <Button disabled title="Sending isn't enabled yet">
                Send (coming soon)
              </Button>
              <span className="text-xs text-slate-500">Sending isn&apos;t enabled yet.</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveEdit} disabled={busy || !isDirty}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button onClick={approve} disabled={busy || !content.trim()}>
                {approving ? "Approving…" : "Approve"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          {generating
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
    edited: "bg-amber-50 text-amber-700 ring-amber-200",
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  const labels: Record<Status, string> = {
    draft: "Draft",
    edited: "Edited draft",
    approved: "Approved",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
