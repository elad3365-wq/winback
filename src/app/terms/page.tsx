import Link from "next/link";

import { Logo } from "@/components/logo";

export const metadata = {
  title: "Terms of Service · WinBack",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Placeholder — WinBack is in active development.</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
          <p>
            These placeholder terms cover the WinBack beta and will be replaced with full terms
            before general availability. By using WinBack during the beta, you understand that some
            features are still in development and may change.
          </p>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Beta software</h2>
            <p className="mt-2">
              WinBack is provided as-is during the beta. Features marked &ldquo;Coming Soon&rdquo; are not yet
              available. Pricing shown is planned and subject to change.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Your account</h2>
            <p className="mt-2">
              You are responsible for the information you enter and for keeping your login secure.
              You may stop using WinBack at any time.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Contact</h2>
            <p className="mt-2">For questions about these terms during the beta, contact the WinBack team.</p>
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
