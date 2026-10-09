"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createBusinessAction } from "@/app/(app)/businesses/actions";
import { INITIAL_CREATE_BUSINESS_STATE } from "@/app/(app)/businesses/form-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { BUSINESS_TYPES } from "@/lib/onboarding";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create business"}
    </Button>
  );
}

export function CreateBusinessForm() {
  const [state, formAction] = useActionState(createBusinessAction, INITIAL_CREATE_BUSINESS_STATE);
  const [businessType, setBusinessType] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Business name" htmlFor="name">
        <Input id="name" name="name" required maxLength={120} placeholder="e.g. Miami Roofing LLC" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Business type" htmlFor="businessType">
          <Select
            id="businessType"
            name="businessType"
            value={businessType}
            onChange={(event) => setBusinessType(event.target.value)}
          >
            <option value="">Choose later</option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        {businessType === "Other" ? (
          <Field label="Describe your business" htmlFor="customBusinessType">
            <Input id="customBusinessType" name="customBusinessType" required />
          </Field>
        ) : null}
        <Field label="Phone" htmlFor="phone" hint="International format, e.g. +13055550142">
          <Input id="phone" name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field label="Business email" htmlFor="email">
          <Input id="email" name="email" type="email" />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" />
        </Field>
        <Field label="State / region" htmlFor="state">
          <Input id="state" name="state" />
        </Field>
        <Field label="Country" htmlFor="country">
          <Input id="country" name="country" />
        </Field>
      </div>

      <p className="text-sm text-slate-500">
        The new business starts empty, with its own leads and its own AI settings (discounts off,
        autopilot off). Your other businesses are not changed. You can fill in the rest in Settings.
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton />
        <Link href="/businesses" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
