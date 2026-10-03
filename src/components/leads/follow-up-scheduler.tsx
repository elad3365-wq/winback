"use client";

import { useState, useTransition } from "react";

import { logContactAction, scheduleFollowUpAction } from "@/app/(app)/leads/[leadId]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { LeadStatus } from "@/lib/database.types";
import { daysOverdue, isDueToday, isOverdue } from "@/lib/leads";

export function FollowUpScheduler({
  leadId,
  status,
  followUpDate,
}: {
  leadId: string;
  status: LeadStatus;
  followUpDate: string | null;
}) {
  const [value, setValue] = useState(followUpDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await scheduleFollowUpAction(leadId, value || null);
      if (result.error) setError(result.error);
    });
  }

  function clear() {
    setValue("");
    setError(null);
    startTransition(async () => {
      const result = await scheduleFollowUpAction(leadId, null);
      if (result.error) setError(result.error);
    });
  }

  function logContact() {
    setError(null);
    startTransition(async () => {
      const result = await logContactAction(leadId);
      if (result.error) setError(result.error);
    });
  }

  const overdue = isOverdue(followUpDate, status);
  const dueToday = isDueToday(followUpDate, status);

  return (
    <div className="space-y-3">
      {overdue ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          Follow-up is {daysOverdue(followUpDate)} day{daysOverdue(followUpDate) === 1 ? "" : "s"} overdue.
        </p>
      ) : dueToday ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Follow-up is due today.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor="next_follow_up" className="block text-xs font-medium text-slate-600">
            Next follow-up
          </label>
          <Input
            id="next_follow_up"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button size="sm" disabled={isPending} onClick={save}>
          Save
        </Button>
        {followUpDate ? (
          <Button variant="secondary" size="sm" disabled={isPending} onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>

      <Button variant="secondary" size="sm" disabled={isPending} onClick={logContact}>
        Log a contact
      </Button>
      <p className="text-xs text-slate-400">Logging a contact stamps the time and bumps the follow-up count.</p>

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
