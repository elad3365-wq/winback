"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

/**
 * Shown only when Supabase has "Confirm email" switched on, in which case
 * signup succeeds but withholds the session until the link is opened.
 */
function CheckYourInbox({ email }: { email: string }) {
  return (
    <div className="text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-2xl"
        aria-hidden="true"
      >
        ✉️
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Confirm your email</h2>
      <p className="mt-2 text-base text-slate-600">
        We sent a confirmation link to <span className="font-medium text-slate-900">{email}</span>.
        Open it and you will land straight in WinBack.
      </p>
      <p className="mt-3 text-sm text-slate-500">
        It can take a couple of minutes. If it is not there, check your spam folder.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg bg-indigo-600 px-5 text-base font-medium text-white transition-colors hover:bg-indigo-500"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL_STATE);

  if (state.confirmationEmail) {
    return <CheckYourInbox email={state.confirmationEmail} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Full name" htmlFor="fullName">
        <Input
          id="fullName"
          name="fullName"
          inputSize="lg"
          autoComplete="name"
          required
          placeholder="Alex Rivera"
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputSize="lg"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@yourbusiness.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Create a password"
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
