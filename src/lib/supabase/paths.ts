/**
 * Pure routing rules for the auth proxy, kept separate so they can be tested.
 */

/** Pages a signed-out visitor may open. Matched as a whole path segment. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth", "/privacy", "/terms"];

/**
 * Machine endpoints that authenticate themselves (CRON_SECRET bearer token, or
 * the Pub/Sub push token). They never carry a user session cookie, so the
 * proxy must not redirect them to /login — that 307 silently disabled the
 * Vercel crons and Gmail push.
 */
const SELF_AUTHENTICATED_PATHS = ["/api/cron", "/api/gmail/push"];

function matchesSegment(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => matchesSegment(pathname, p)) ||
    SELF_AUTHENTICATED_PATHS.some((p) => matchesSegment(pathname, p))
  );
}

/**
 * Whether a stray Supabase PKCE `?code=` on this path should be forwarded to
 * /auth/callback. API routes are excluded: /api/gmail/callback receives
 * Google's own OAuth `code` and must handle it itself.
 */
export function shouldForwardAuthCode(pathname: string, hasCode: boolean) {
  if (!hasCode) return false;
  if (matchesSegment(pathname, "/auth")) return false;
  if (matchesSegment(pathname, "/api")) return false;
  return true;
}
