import { NextResponse, type NextRequest } from "next/server";

import { requireBusinessContext } from "@/lib/business";
import { gmailConfig, isGmailFeatureEnabled } from "@/lib/gmail/config";
import { buildAuthUrl } from "@/lib/gmail/oauth";
import { createState } from "@/lib/gmail/oauth-state";

/**
 * Start the per-business Gmail OAuth flow. Owner-only. Redirects to Google's
 * consent screen with a signed `state` that binds the round trip to this
 * business + user. Inert (404) unless the feature flag + OAuth config are set.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGmailFeatureEnabled()) {
    return NextResponse.json({ error: "Gmail integration is not enabled." }, { status: 404 });
  }

  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) {
    // A browser navigation lands here, so go back to the page with a readable
    // reason instead of showing a raw JSON error.
    const url = request.nextUrl.clone();
    url.pathname = "/settings/email";
    url.search = "?gmail_error=not_owner";
    return NextResponse.redirect(url);
  }

  const state = createState(business.id, user.id);
  const url = buildAuthUrl(gmailConfig(), state);
  return NextResponse.redirect(url);
}
