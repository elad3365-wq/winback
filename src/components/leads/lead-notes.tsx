"use client";

import { useState, useTransition } from "react";

import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/app/(app)/leads/[leadId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { LeadNote } from "@/lib/database.types";
import { formatDate } from "@/lib/format";

export function LeadNotes({ leadId, notes }: { leadId: string; notes: LeadNote[] }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!draft.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addNoteAction(leadId, draft);
      if (result.error) setError(result.error);
      else setDraft("");
    });
  }

  function saveEdit() {
    if (!editing) return;
    const { id, body } = editing;
    setError(null);
    startTransition(async () => {
      const result = await updateNoteAction(id, leadId, body);
      if (result.error) setError(result.error);
      else setEditing(null);
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this note?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteNoteAction(id, leadId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Add a note about this lead…"
          aria-label="New note"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={isPending || !draft.trim()} onClick={add}>
            Add note
          </Button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {notes.length === 0 ? (
        <p className="text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              {editing?.id === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ id: note.id, body: e.target.value })}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={isPending} onClick={saveEdit}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap text-slate-800">{note.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{formatDate(note.created_at.slice(0, 10))}</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ id: note.id, body: note.body })}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" disabled={isPending} onClick={() => remove(note.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
