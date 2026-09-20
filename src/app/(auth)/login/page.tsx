import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · WinBack",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const { next } = await searchParams;

  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to pick up your follow-ups.</p>

      <LoginForm next={typeof next === "string" ? next : undefined} />

      <p className="mt-6 text-center text-sm text-slate-500">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
          Create one
        </Link>
      </p>
    </div>
  );
}
