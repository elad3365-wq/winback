"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteLeadAction, updateLeadStatusAction } from "@/app/(app)/leads/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { LeadStatus } from "@/lib/database.types";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/leads";

export function LeadStatusControl({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState<LeadStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setStatus(next: LeadStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const result = await updateLeadStatusAction(leadId, next);
      if (result.error) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!window.confirm("Delete this lead? This permanently removes it and its notes. This cannot be undone.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteLeadAction(leadId);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/leads");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Change status"
          value={current}
          disabled={isPending}
          onChange={(e) => setStatus(e.target.value as LeadStatus)}
          className="w-44"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {current !== "recovered" ? (
          <Button size="sm" disabled={isPending} onClick={() => setStatus("recovered")}>
            Mark Recovered
          </Button>
        ) : null}
        {current !== "lost" ? (
          <Button variant="secondary" size="sm" disabled={isPending} onClick={() => setStatus("lost")}>
            Mark Lost
          </Button>
        ) : null}
        <Button variant="danger" size="sm" disabled={isPending} onClick={remove}>
          Delete
        </Button>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
