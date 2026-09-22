"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInAction, type AuthFormState } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign In"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <Field label="Password" htmlFor="password">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
