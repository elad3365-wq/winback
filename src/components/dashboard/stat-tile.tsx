import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "default" | "emerald" | "amber" | "rose" | "indigo";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-slate-900",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  indigo: "text-indigo-600",
};

/** Compact KPI tile. Becomes a link when `href` is provided. */
export function StatTile({
  label,
  value,
  tone = "default",
  hint,
  href,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  hint?: string;
  href?: string;
}) {
  const inner: ReactNode = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", VALUE_TONE[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </>
  );

  const base = "block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200";
  if (href) {
    return (
      <Link href={href} className={cn(base, "transition-colors hover:ring-indigo-300")}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
