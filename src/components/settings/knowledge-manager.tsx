"use client";

import { useState, useTransition } from "react";

import {
  addKnowledgeAction,
  deleteKnowledgeAction,
  setKnowledgeApprovedAction,
  updateKnowledgeAction,
  type KnowledgeActionResult,
} from "@/app/(app)/settings/knowledge/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { BusinessKnowledge } from "@/lib/database.types";
import {
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_MAX_ENTRIES,
  KNOWLEDGE_TITLE_MAX,
  type KnowledgeKind,
} from "@/lib/knowledge-input";

type Draft = { kind: KnowledgeKind; title: string; content: string };
const EMPTY: Draft = { kind: "fact", title: "", content: "" };

const EXAMPLES = [
  "Gutter cleaning: $180 for a single-story home",
  "Workmanship warranty: 2 years on all roof repairs",
  "Service area: Miami-Dade and Broward only",
  "Estimates are free and valid for 30 days",
];

export function KnowledgeManager({ entries, canEdit }: { entries: BusinessKnowledge[]; canEdit: boolean }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<KnowledgeActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else onOk?.();
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = { ...draft };
    run(
      () => (editingId ? updateKnowledgeAction(editingId, input) : addKnowledgeAction(input)),
      () => {
        setDraft(EMPTY);
        setEditingId(null);
      },
    );
  }

  function startEdit(entry: BusinessKnowledge) {
    setEditingId(entry.id);
    setDraft({ kind: entry.kind as KnowledgeKind, title: entry.title ?? "", content: entry.content });
    setError(null);
  }

  const atLimit = entries.length >= KNOWLEDGE_MAX_ENTRIES && !editingId;

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canEdit ? (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">{editingId ? "Edit entry" : "Add a fact"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type" htmlFor="kb-kind">
              <Select
                id="kb-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as KnowledgeKind })}
              >
                {KNOWLEDGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KNOWLEDGE_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Title (optional)" htmlFor="kb-title">
                <Input
                  id="kb-title"
                  value={draft.title}
                  maxLength={KNOWLEDGE_TITLE_MAX}
                  placeholder="e.g. Gutter cleaning price"
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <Field
            label="What the AI may say"
            htmlFor="kb-content"
            hint={`${draft.content.length}/${KNOWLEDGE_CONTENT_MAX} · Write it exactly as true today. Examples: ${EXAMPLES[0]}; ${EXAMPLES[1]}.`}
          >
            <Textarea
              id="kb-content"
              rows={3}
              value={draft.content}
              maxLength={KNOWLEDGE_CONTENT_MAX}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || atLimit || !draft.content.trim()}>
              {isPending ? "Saving…" : editingId ? "Save entry" : "Add to knowledge base"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null);
                  setDraft(EMPTY);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
          {atLimit ? (
            <p className="text-xs text-amber-700">
              You&apos;ve reached {KNOWLEDGE_MAX_ENTRIES} entries — the most the AI reads. Combine or delete some to add more.
            </p>
          ) : null}
        </form>
      ) : (
        <Alert tone="info">Only the business owner can change the knowledge base.</Alert>
      )}

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          <p className="font-medium text-slate-900">No facts yet</p>
          <p className="mt-1">
            Until you add some, the AI only uses the lead&apos;s estimate and your Settings — it won&apos;t
            quote any other price or promise.
          </p>
          <ul className="mx-auto mt-3 max-w-md list-disc space-y-0.5 pl-5 text-left text-slate-500">
            {EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {KNOWLEDGE_KIND_LABELS[entry.kind as KnowledgeKind] ?? entry.kind}
                  {entry.approved ? "" : " · not used by AI"}
                </p>
                {entry.title ? <p className="mt-0.5 font-medium text-slate-900">{entry.title}</p> : null}
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-700">{entry.content}</p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => startEdit(entry)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => run(() => setKnowledgeApprovedAction(entry.id, !entry.approved))}
                  >
                    {entry.approved ? "Stop using" : "Use in AI"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => {
                      if (window.confirm("Delete this entry? The AI will stop using it.")) {
                        run(() => deleteKnowledgeAction(entry.id));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
