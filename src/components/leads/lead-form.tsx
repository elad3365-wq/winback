"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { createLeadAction, updateLeadAction } from "@/app/(app)/leads/actions";
import {
  INITIAL_LEAD_FORM_STATE,
  type LeadFormState,
} from "@/app/(app)/leads/form-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Lead } from "@/lib/database.types";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/leads";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function LeadForm({
  lead,
  onSaved,
  onCancel,
}: {
  lead?: Lead;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(lead);
  const [state, formAction] = useActionState<LeadFormState, FormData>(
    isEdit ? updateLeadAction : createLeadAction,
    INITIAL_LEAD_FORM_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSaved();
    }
  }, [state.status, state.submittedAt, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      {lead ? <input type="hidden" name="id" value={lead.id} /> : null}

      <Field label="Customer name" htmlFor="customer_name">
        <Input
          id="customer_name"
          name="customer_name"
          required
          maxLength={120}
          defaultValue={lead?.customer_name ?? ""}
          placeholder="Dana Whitfield"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            maxLength={30}
            defaultValue={lead?.phone ?? ""}
            placeholder="(555) 123-4567"
          />
        </Field>

        <Field label="Service" htmlFor="service">
          <Input
            id="service"
            name="service"
            required
            maxLength={120}
            defaultValue={lead?.service ?? ""}
            placeholder="Water heater replacement"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimate amount" htmlFor="estimate_amount" hint="In dollars.">
          <Input
            id="estimate_amount"
            name="estimate_amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={lead ? String(lead.estimate_amount) : ""}
            placeholder="1850"
          />
        </Field>

        <Field label="Follow-up date" htmlFor="follow_up_date" hint="Optional.">
          <Input
            id="follow_up_date"
            name="follow_up_date"
            type="date"
            defaultValue={lead?.follow_up_date ?? ""}
          />
        </Field>
      </div>

      <Field label="Status" htmlFor="status">
        <Select id="status" name="status" defaultValue={lead?.status ?? "new"}>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEAD_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </Field>

      {state.status === "error" && state.error ? (
        <Alert tone="error">{state.error}</Alert>
      ) : null}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton label={isEdit ? "Save changes" : "Add lead"} />
      </div>
    </form>
  );
}
