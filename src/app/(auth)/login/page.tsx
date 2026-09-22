import Link from "next/link";

import { AuthDivider } from "@/components/auth/auth-divider";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/setup-notice";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/lib/auth-destination";
import { AUTH_MESSAGES } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · WinBack",
};

/** Plain-language versions of the reasons a redirect can land back here. */
const ERROR_MESSAGES: Record<string, string> = {
  google: AUTH_MESSAGES.google,
  link: AUTH_MESSAGES.expiredLink,
  confirmation_failed: AUTH_MESSAGES.expiredLink,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; status?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const { next, error, status } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : null) ?? undefined;
  const errorMessage = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;
  const successMessage =
    status === "password_updated" ? "Password updated. Sign in with your new password." : undefined;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-1 text-base text-slate-500">Sign in to continue to WinBack.</p>

      {errorMessage ? (
        <div className="mt-5">
          <Alert tone="error">{errorMessage}</Alert>
        </div>
      ) : null}
      {successMessage ? (
        <div className="mt-5">
          <Alert tone="success">{successMessage}</Alert>
        </div>
      ) : null}

      <div className="mt-6">
        <GoogleButton label="Continue with Google" next={target} />
      </div>

      <AuthDivider label="or continue with email" />

      <LoginForm next={target} />

      <div className="mt-4 text-center">
        <Link
          href="/forgot-password"
          className="inline-block py-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Forgot password?
        </Link>
      </div>

      <p className="mt-6 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
          Create account
        </Link>
      </p>
    </div>
  );
}
