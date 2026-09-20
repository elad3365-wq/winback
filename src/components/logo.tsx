import Link from "next/link";

import { cn } from "@/lib/cn";

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white"
        aria-hidden="true"
      >
        W
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-900">WinBack</span>
    </Link>
  );
}
