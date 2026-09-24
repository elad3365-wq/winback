"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import type { Lead } from "@/lib/database.types";

type Channel = "sms" | "email";

type GenerateResponse = {
  id: string;
  content: string;
  channel: Channel;
  discountOffered: boolean;
  createdAt: string;
};

/**
 * Draft-only AI follow-up. Generates a message for one lead, shows it in an
 * editable box, and lets the owner regenerate or copy it. Nothing is sent —
 * the owner pastes the text into their own texting/email tool.
 */
export function AiFollowup({ lead }: { lead: Lead }) {
  const [channel, setChannel] = useState<Channel>("sms");
  const [message, setMessage] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
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

      setMessage(data.content ?? "");
      setHasGenerated(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select the text and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">AI follow-up draft</h3>
        <p className="mt-1 text-sm text-slate-500">
          Generate a follow-up for{" "}
          <span className="font-medium text-slate-700">{lead.customer_name}</span> about{" "}
          <span className="font-medium text-slate-700">{lead.service}</span>. It uses your
          business&apos;s AI rules. This is a draft only — nothing is sent.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <Field label="Channel" htmlFor="ai-channel">
            <Select
              id="ai-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as Channel)}
              disabled={loading}
            >
              <option value="sms">Text message</option>
              <option value="email">Email</option>
            </Select>
          </Field>
        </div>

        <div className="flex gap-2">
          <Button onClick={generate} disabled={loading}>
            {loading ? "Generating…" : hasGenerated ? "Regenerate" : "Generate AI Follow-up"}
          </Button>
          {hasGenerated ? (
            <Button variant="secondary" onClick={copy} disabled={loading || !message.trim()}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {hasGenerated ? (
        <Field label="Message" htmlFor="ai-message" hint="Edit anything before you use it.">
          <Textarea
            id="ai-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={channel === "email" ? 7 : 4}
          />
        </Field>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          {loading
            ? "Writing a follow-up…"
            : "Click Generate to draft a follow-up message for this lead."}
        </p>
      )}
    </div>
  );
}
