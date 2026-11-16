import { NextResponse } from "next/server";

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

export async function GET() {
  if (!isGmailFeatureEnabled()) {
    return NextResponse.json({ error: "Gmail integration is not enabled." }, { status: 404 });
  }

  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the business owner can connect Gmail." }, { status: 403 });
  }

  const state = createState(business.id, user.id);
  const url = buildAuthUrl(gmailConfig(), state);
  return NextResponse.redirect(url);
}
