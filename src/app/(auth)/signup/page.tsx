import Link from "next/link";

import { AuthDivider } from "@/components/auth/auth-divider";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { SetupNotice } from "@/components/setup-notice";
import { Alert } from "@/components/ui/alert";
import { authErrorFromParam } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create your account · WinBack",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const { error } = await searchParams;
  const errorMessage = authErrorFromParam(typeof error === "string" ? error : undefined);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Create your WinBack account
      </h1>
      <p className="mt-1 text-base text-slate-500">Start recovering the estimates nobody answered.</p>

      {errorMessage ? (
        <div className="mt-5">
          <Alert tone="error">{errorMessage}</Alert>
        </div>
      ) : null}

      <div className="mt-6">
        <GoogleButton label="Continue with Google" from="/signup" />
      </div>

      <AuthDivider label="or sign up with email" />

      <SignupForm />

      <p className="mt-6 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
