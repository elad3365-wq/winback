import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <div className="mx-auto mb-10 flex justify-center">
        <Logo href="/" />
      </div>
      {children}
    </div>
  );
}
