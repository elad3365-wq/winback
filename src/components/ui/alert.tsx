import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const TONES = {
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg px-3 py-2 text-sm ring-1 ring-inset", TONES[tone])}
    >
      {children}
    </div>
  );
}
