"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { signInWithGoogleAction } from "@/app/(auth)/actions";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-white px-5 text-base font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleMark />
      {pending ? "Opening Google…" : label}
    </button>
  );
}

/**
 * Tells the server the origin this page is open on, so the callback Supabase is
 * given is the address the visitor is actually using. It is filled in after
 * mount, which keeps the button working before hydration: the field is then
 * empty and the server falls back to the host the request arrived on.
 */
function BrowserOrigin() {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (field.current) field.current.value = window.location.origin;
  }, []);

  return <input ref={field} type="hidden" name="origin" defaultValue="" />;
}

/**
 * Hands off to Supabase's Google OAuth. It is a plain form posting to a server
 * action, so it works before the page has finished hydrating.
 *
 * The exchange has to happen on the server: Supabase writes the PKCE verifier
 * into a cookie here, and /auth/callback reads it back out of the same jar.
 */
export function GoogleButton({
  label,
  next,
  from,
}: {
  label: string;
  next?: string;
  /** Where to show a problem, so a press on /signup never answers on /login. */
  from: "/login" | "/signup";
}) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="from" value={from} />
      <BrowserOrigin />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Submit label={label} />
    </form>
  );
}
