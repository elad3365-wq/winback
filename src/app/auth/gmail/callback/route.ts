import { NextResponse, type NextRequest } from "next/server";

import {
  ACTIVE_BUSINESS_COOKIE,
  ACTIVE_BUSINESS_COOKIE_OPTIONS,
} from "@/lib/active-business";
import { listMyBusinesses } from "@/lib/business";
import { GMAIL_SCOPES, getGmailOAuthConfig } from "@/lib/gmail/config";
import { exchangeCode, getProfileEmail, revokeToken } from "@/lib/gmail/google";
import {
  GMAIL_OAUTH_COOKIE,
  GMAIL_OAUTH_COOKIE_OPTIONS,
  readOAuthState,
} from "@/lib/gmail/oauth-state";
import { saveConnection } from "@/lib/gmail/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Google sends the browser back here after a member allowed WinBack to read
 * their business inbox and send the replies they approve. Lives under /auth so
 * the proxy passes the `code` through instead of treating it as a sign-in.
 *
 * The connection is saved only when: the browser carries the cookie set by the
 * click that started this (same random state), the person is still signed in,
 * and they are still a member of the business they were connecting.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/settings/email?gmail=${result}`, request.nextUrl.origin));
  response.cookies.set(GMAIL_OAUTH_COOKIE, "", { ...GMAIL_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = readOAuthState(request.cookies.get(GMAIL_OAUTH_COOKIE)?.value);

  if (params.get("error")) {
    return back(request, params.get("error") === "access_denied" ? "cancelled" : "google_error");
  }
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) {
    return back(request, "expired");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings/email", request.nextUrl.origin));
  }

  const memberships = await listMyBusinesses(supabase, user.id);
  if (!memberships.some((membership) => membership.id === saved.businessId)) {
    return back(request, "not_member");
  }

  const config = getGmailOAuthConfig();
  const admin = createAdminClient();
  if (!config || !admin) {
    return back(request, "not_configured");
  }

  let refreshToken: string | null = null;
  try {
    const tokens = await exchangeCode({
      config,
      code,
      redirectUri: saved.redirectUri,
      codeVerifier: saved.verifier,
    });
    refreshToken = tokens.refreshToken;

    const granted = tokens.scope.split(/\s+/);
    if (!granted.includes(GMAIL_SCOPES[0])) {
      await revokeToken(tokens.refreshToken);
      return back(request, "missing_read");
    }

    const emailAddress = await getProfileEmail(tokens.accessToken);
    await saveConnection(admin, {
      businessId: saved.businessId,
      emailAddress,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scope,
      userId: user.id,
    });

    const response = back(request, granted.includes(GMAIL_SCOPES[1]) ? "connected" : "connected_read_only");
    // Land on the business that was just connected.
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, saved.businessId, ACTIVE_BUSINESS_COOKIE_OPTIONS);
    return response;
  } catch (cause) {
    console.error("[gmail/callback] connecting Gmail failed", {
      business: saved.businessId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    if (refreshToken) await revokeToken(refreshToken);
    return back(request, "failed");
  }
}
