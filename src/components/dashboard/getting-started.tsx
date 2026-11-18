import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { GettingStartedStep } from "@/lib/getting-started";

/** First-run checklist: which step of the beta loop is next, and a link to it. */
export function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const required = steps.filter((step) => !step.optional);
  const doneCount = required.filter((step) => step.done).length;
  const nextKey = steps.find((step) => !step.done)?.key;

  return (
    <Card>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-slate-900">Get started with WinBack</h2>
        <p className="text-xs font-medium text-slate-500">
          {doneCount} of {required.length} done
        </p>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required.length}
        aria-valuenow={doneCount}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${(doneCount / required.length) * 100}%` }}
        />
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => {
          const isNext = step.key === nextKey;
          return (
            <li
              key={step.key}
              className={cn(
                "flex flex-col gap-3 rounded-lg p-3 ring-1 ring-inset sm:flex-row sm:items-center sm:justify-between",
                isNext ? "bg-indigo-50/60 ring-indigo-200" : "ring-slate-200",
              )}
            >
              <div className="flex min-w-0 gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600",
                  )}
                  aria-hidden
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", step.done ? "text-slate-500 line-through" : "text-slate-900")}>
                    {step.title}
                    <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                  </p>
                  {step.done ? null : <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>}
                </div>
              </div>
              {step.done ? null : (
                <Link
                  href={step.href}
                  className={buttonClasses(isNext ? "primary" : "secondary", "sm", "shrink-0 self-start sm:self-center")}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
