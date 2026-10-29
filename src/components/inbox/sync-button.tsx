"use client";

import { useState, useTransition } from "react";

import { syncInboxAction } from "@/app/(app)/inbox/actions";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncInboxAction();
            setNote(
              result.error
                ? { text: result.error, error: true }
                : { text: result.message ?? "Done.", error: false },
            );
          })
        }
      >
        {pending ? "Checking…" : "Check for new email"}
      </Button>
      {note ? (
        <span className={note.error ? "text-xs text-rose-600" : "text-xs text-slate-500"}>{note.text}</span>
      ) : null}
    </div>
  );
}
