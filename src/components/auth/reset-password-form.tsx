"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updatePasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Save new password"}
    </Button>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Your new password"
        />
      </Field>

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
