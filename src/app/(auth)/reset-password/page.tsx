import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set a new password · WinBack",
};

export default function ResetPasswordPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Set a new password</h1>
      <p className="mt-1 text-sm text-slate-500">Choose a new password for your account.</p>

      <ResetPasswordForm />
    </div>
  );
}
