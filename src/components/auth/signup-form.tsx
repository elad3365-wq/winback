"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Your name" htmlFor="fullName">
        <Input id="fullName" name="fullName" autoComplete="name" placeholder="Alex Rivera" />
      </Field>

      <Field label="Business name" htmlFor="businessName">
        <Input
          id="businessName"
          name="businessName"
          autoComplete="organization"
          placeholder="Rivera Plumbing"
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@yourbusiness.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
