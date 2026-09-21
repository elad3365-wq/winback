"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { CheckIcon } from "@/components/marketing/icons";
import { submitBetaAction } from "@/components/marketing/beta-actions";
import {
  BUSINESS_TYPES,
  INITIAL_BETA_FORM_STATE,
} from "@/components/marketing/beta-form-state";

const fieldClass =
  "mt-1.5 w-full rounded-lg border-0 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition focus:ring-2 focus:ring-inset focus:ring-indigo-500 placeholder:text-slate-400";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Sending…" : "Join the Beta"}
    </button>
  );
}

export function BetaForm() {
  const [state, formAction] = useActionState(submitBetaAction, INITIAL_BETA_FORM_STATE);

  if (state.status === "success") {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">You&apos;re on the list</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          Thanks for your interest in WinBack. We&apos;ll reach out with early access details soon.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="beta-name" className="text-sm font-medium text-slate-700">
            Name
          </label>
          <input id="beta-name" name="name" type="text" autoComplete="name" placeholder="Jordan Miller" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="beta-business" className="text-sm font-medium text-slate-700">
            Business name
          </label>
          <input
            id="beta-business"
            name="business_name"
            type="text"
            autoComplete="organization"
            placeholder="Miller Auto Care"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="beta-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="beta-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourbusiness.com"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="beta-type" className="text-sm font-medium text-slate-700">
            Business type
          </label>
          <select id="beta-type" name="business_type" defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Select one…
            </option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.status === "error" && state.error ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.error}
        </p>
      ) : null}

      <div className="mt-5">
        <SubmitButton />
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        No credit card. We&apos;ll only email you about WinBack early access.
      </p>
    </form>
  );
}
