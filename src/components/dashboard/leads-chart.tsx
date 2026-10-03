"use client";

import { useMemo, useState } from "react";

import type { DailyPoint } from "@/lib/leads";

/**
 * A dependency-free bar chart of leads created per day. The server passes the
 * last 30 days; the toggle slices to 7 or 30 locally. Heights are relative to
 * the busiest day in view.
 */
export function LeadsChart({ points }: { points: DailyPoint[] }) {
  const [range, setRange] = useState<7 | 30>(7);

  const visible = useMemo(() => (range === 7 ? points.slice(-7) : points), [points, range]);
  const max = useMemo(() => Math.max(1, ...visible.map((p) => p.count)), [visible]);
  const total = useMemo(() => visible.reduce((sum, p) => sum + p.count, 0), [visible]);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Leads created</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {total} in the last {range} days
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Chart range">
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-slate-400">
          No leads created in this period yet.
        </p>
      ) : (
        <div
          className="mt-5 flex h-36 items-end gap-1"
          role="img"
          aria-label={`Leads created per day over the last ${range} days, ${total} total.`}
        >
          {visible.map((point) => {
            const heightPct = Math.round((point.count / max) * 100);
            return (
              <div key={point.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end">
                <div className="relative flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-indigo-500/80 transition-all group-hover:bg-indigo-600"
                    style={{ height: `${Math.max(point.count === 0 ? 0 : 6, heightPct)}%` }}
                    title={`${formatDay(point.date)}: ${point.count}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {total > 0 ? (
        <div className="mt-2 flex justify-between text-[10px] text-slate-400">
          <span>{formatDay(visible[0]?.date)}</span>
          <span>{formatDay(visible[visible.length - 1]?.date)}</span>
        </div>
      ) : null}
    </section>
  );
}

function formatDay(value: string | undefined) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
