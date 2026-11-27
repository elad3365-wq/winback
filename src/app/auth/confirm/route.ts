import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { destinationAfterAuth, safeNext } from "@/lib/auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the links Supabase emails: the signup confirmation and the
 * password reset. They arrive as a one-time `token_hash` (custom template) or,
 * with Supabase's default templates, as a PKCE `code` after Supabase verified
 * the link itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      // A recovery link has one job: let the owner set a new password. It must
      // not be diverted into onboarding on the way.
      if (type === "recovery") {
        return NextResponse.redirect(new URL("/reset-password", origin));
      }

      const destination = data.user
        ? await destinationAfterAuth(supabase, data.user.id, next)
        : (safeNext(next) ?? "/dashboard");
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  // Supabase's default email templates use {{ .ConfirmationURL }}: Supabase
  // verifies the link itself and then sends the browser here with a PKCE
  // `code` instead of a token_hash. Exchange it when this browser holds the
  // verifier. When it does not (the email was opened on another device), the
  // address IS already confirmed by Supabase, so send the owner to sign in
  // rather than showing a broken-link error.
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const isRecovery = next === "/reset-password";
    if (!error && data.user) {
      if (isRecovery) return NextResponse.redirect(new URL("/reset-password", origin));
      const destination = await destinationAfterAuth(supabase, data.user.id, next);
      return NextResponse.redirect(new URL(destination, origin));
    }
    console.error("[auth/confirm] code exchange failed", { code: error?.code ?? null, status: error?.status ?? null });
    // A reset link opened on another device cannot set a password here; ask
    // for a fresh link instead of claiming anything was confirmed.
    if (isRecovery) return NextResponse.redirect(new URL("/login?error=link", origin));
    return NextResponse.redirect(new URL("/login?status=email_confirmed", origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
