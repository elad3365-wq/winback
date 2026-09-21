import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset your password · WinBack",
};

export default function ForgotPasswordPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Forgot your password?</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter your email and we&apos;ll send you a link to set a new one.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
