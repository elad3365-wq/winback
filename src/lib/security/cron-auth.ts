import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Never true without a configured secret. Compared in constant time (both
 * sides hashed first, so lengths match and nothing leaks through timing).
 */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !authorization) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const provided = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, provided);
}
