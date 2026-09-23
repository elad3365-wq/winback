import { NextResponse, type NextRequest } from "next/server";

import { destinationAfterAuth } from "@/lib/auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Google (and any future OAuth provider).
 *
 * Supabase sends the browser back here with a single-use `code`. Exchanging it
 * on the server writes the session cookies straight onto this redirect, so the
 * owner arrives at the next page already signed in.
 *
 * Every way this can fail is logged with the detail Supabase gave us and sent
 * back under its own reason code, so the login page can say which step broke
 * without ever printing provider internals at the owner.
 */

function failed(origin: string, reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // Present when several PKCE flows are in flight; picks the matching verifier.
  const flowId = searchParams.get("sb_flow_id");

  // Supabase refused before it ever issued a code.
  const providerError = searchParams.get("error") ?? searchParams.get("error_code");
  if (providerError) {
    const description = searchParams.get("error_description") ?? "";
    console.error("[auth/callback] provider refused the sign in", {
      error: searchParams.get("error"),
      error_code: searchParams.get("error_code"),
      error_description: description,
    });

    if (searchParams.get("error") === "access_denied") {
      return failed(origin, "google_cancelled");
    }
    // How Supabase reports a handle_new_user trigger that raised.
    if (/database error/i.test(description)) {
      return failed(origin, "google_account");
    }
    return failed(origin, "google");
  }

  if (!code) {
    console.error("[auth/callback] arrived with neither a code nor an error", {
      params: [...searchParams.keys()],
    });
    return failed(origin, "google_expired");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error) {
    console.error("[auth/callback] code exchange failed", {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
      hadFlowId: Boolean(flowId),
    });
    // The verifier cookie written when the flow started did not come back, so
    // the code cannot be proved to belong to this browser.
    if (/verifier/i.test(`${error.code ?? ""} ${error.message}`)) {
      return failed(origin, "google_session");
    }
    return failed(origin, "google_exchange");
  }

  if (!data.user) {
    console.error("[auth/callback] code exchange returned no user");
    return failed(origin, "google_exchange");
  }

  // Past this point the owner IS signed in, so nothing below may send them
  // back to /login: that would read as an authentication failure when the only
  // thing that broke is our guess at where to put them.
  let destination = "/onboarding";
  try {
    destination = await destinationAfterAuth(supabase, data.user.id, next);
  } catch (cause) {
    console.error("[auth/callback] could not read onboarding state", cause);
  }

  return NextResponse.redirect(new URL(destination, origin));
}
