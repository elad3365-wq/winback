"use client";

import { useState, useTransition } from "react";

import { setAutopilotPausedAction } from "@/app/(app)/leads/[leadId]/actions";
import { Button } from "@/components/ui/button";

export function LeadAutopilotToggle({ leadId, paused }: { leadId: string; paused: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setAutopilotPausedAction(leadId, !paused);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
          paused ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        }`}
      >
        {paused ? "Paused" : "Active"}
      </span>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={toggle}>
        {paused ? "Resume" : "Pause"}
      </Button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
