import { NextResponse, type NextRequest } from "next/server";

import { destinationAfterAuth } from "@/lib/auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Google (and any future OAuth provider).
 *
 * Supabase sends the browser back here with a single-use `code`. Exchanging it
 * on the server writes the session cookies straight onto this redirect, so the
 * owner arrives at the next page already signed in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Present when several PKCE flows are in flight; picks the matching verifier.
  const flowId = searchParams.get("sb_flow_id");

  // The provider or Supabase refused before we ever got a code.
  if (searchParams.get("error") || searchParams.get("error_code") || !code) {
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }

  const destination = await destinationAfterAuth(supabase, data.user.id, next);
  return NextResponse.redirect(new URL(destination, origin));
}
