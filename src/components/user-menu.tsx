"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { signOutAction } from "@/app/(auth)/actions";
import { switchBusinessAction } from "@/app/(app)/businesses/actions";
import type { BusinessSummary } from "@/lib/active-business";

/**
 * The account menu in the app shell. Shows the business being worked in, lets
 * the owner switch to another business they belong to or create a new one, and
 * holds the Logout option, which returns them to the marketing homepage.
 */
export function UserMenu({
  businessName,
  email,
  activeBusinessId,
  businesses,
}: {
  businessName: string;
  email: string;
  activeBusinessId: string;
  businesses: BusinessSummary[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (businessName.trim()[0] ?? email.trim()[0] ?? "W").toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{businessName}</span>
          <span className="block truncate text-xs text-slate-500">{email}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="m6 12 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 w-full min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Businesses
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {businesses.map((business) =>
              business.id === activeBusinessId ? (
                <li
                  key={business.id}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-indigo-700"
                  aria-current="true"
                >
                  <span className="truncate">{business.name}</span>
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-label="Current business"
                  >
                    <path d="m5 10 3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </li>
              ) : (
                <li key={business.id}>
                  <form action={switchBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <button
                      type="submit"
                      role="menuitem"
                      className="w-full truncate rounded-md px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      {business.name}
                    </button>
                  </form>
                </li>
              ),
            )}
          </ul>
          <Link
            href="/businesses/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            + Create business
          </Link>
          <Link
            href="/businesses"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Manage businesses
          </Link>
          <div className="my-1 border-t border-slate-200" />
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
