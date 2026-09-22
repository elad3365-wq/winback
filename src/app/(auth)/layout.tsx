import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-slate-50 to-indigo-50/60 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
