import { NextResponse, type NextRequest } from "next/server";

import { getProfile } from "@/lib/gmail/api";
import { gmailConfig, isGmailFeatureEnabled } from "@/lib/gmail/config";
import { storeConnection } from "@/lib/gmail/connection";
import { exchangeCodeForTokens } from "@/lib/gmail/oauth";
import { verifyState } from "@/lib/gmail/oauth-state";
import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth callback for the per-business Gmail flow. Verifies the signed
 * state, confirms the signed-in user is the SAME user who started AND the owner
 * of the business named in the state (never writes to a mailbox for another
 * tenant), exchanges the code, and stores ENCRYPTED tokens. Errors land back on
 * the settings page with a safe, code-only reason.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSettings(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/settings/email";
  url.search = "";
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isGmailFeatureEnabled()) {
    return NextResponse.json({ error: "Gmail integration is not enabled." }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) return redirectToSettings(request, { gmail_error: providerError.slice(0, 40) });

  const code = params.get("code");
  const payload = verifyState(params.get("state"));
  if (!code || !payload) return redirectToSettings(request, { gmail_error: "invalid_state" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return redirectToSettings(request, { gmail_error: "session_mismatch" });
  }

  // The owner of the business named in the signed state — never another tenant.
  const { data: business } = await supabase
    .from("businesses")
    .select("id, owner_id")
    .eq("id", payload.businessId)
    .maybeSingle();
  if (!business || business.owner_id !== user.id) {
    return redirectToSettings(request, { gmail_error: "not_owner" });
  }

  try {
    const tokens = await exchangeCodeForTokens(gmailConfig(), code);
    const profile = await getProfile(tokens.access_token);
    await storeConnection(supabase, {
      businessId: business.id,
      userId: user.id,
      email: profile.emailAddress,
      tokens,
    });
  } catch {
    return redirectToSettings(request, { gmail_error: "exchange_failed" });
  }

  return redirectToSettings(request, { gmail_connected: "1" });
}
