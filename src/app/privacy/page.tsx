import Link from "next/link";

import { Logo } from "@/components/logo";

export const metadata = {
  title: "Privacy Policy · WinBack",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Placeholder — WinBack is in active development.</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
          <p>
            This is a placeholder privacy policy for the WinBack beta. It will be replaced with a
            complete policy before general availability. If you have questions in the meantime,
            please reach out to the WinBack team.
          </p>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Information we handle</h2>
            <p className="mt-2">
              When you create an account, WinBack stores the business and account details you
              provide (such as your name, email, and business information) so the product can
              function. Customer records you add are stored for your business only.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">How your data is used</h2>
            <p className="mt-2">
              Your data is used to operate WinBack for your business — showing your dashboard,
              leads, and settings. Access is restricted to your business account.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Contact</h2>
            <p className="mt-2">For any privacy questions during the beta, contact the WinBack team.</p>
          </div>
        </div>

        <div className="mt-12">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
