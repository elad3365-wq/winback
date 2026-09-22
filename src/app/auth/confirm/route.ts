import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { destinationAfterAuth, safeNext } from "@/lib/auth-destination";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for the links Supabase emails: the signup confirmation and the
 * password reset. Both arrive as a one-time `token_hash`.
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

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
