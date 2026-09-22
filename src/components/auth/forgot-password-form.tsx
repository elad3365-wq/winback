"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestPasswordResetAction, type AuthFormState } from "@/app/(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
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

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
