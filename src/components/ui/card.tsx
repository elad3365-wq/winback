import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
