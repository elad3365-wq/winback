/**
 * Best-effort business-hours check for the autopilot scheduler.
 *
 * business_hours is free text with no timezone, so this is deliberately
 * conservative and fails OPEN: if we can't confidently read a daily window from
 * it, we allow drafting (nothing is sent, so an off-hours draft is harmless).
 * Real timezone-aware enforcement belongs in the send phase, not here.
 */

// Matches a start/end hour range like "9-17", "9am - 5pm", "08:00 to 20:00".
const RANGE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function to24(hour: number, meridiem?: string): number {
  const m = meridiem?.toLowerCase();
  if (m === "am") return hour === 12 ? 0 : hour;
  if (m === "pm") return hour === 12 ? 12 : hour + 12;
  return hour;
}

export function isWithinBusinessHours(
  businessHours: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const text = businessHours?.trim();
  if (!text) return true; // no hours configured → always allowed

  const match = RANGE.exec(text);
  if (!match) return true; // unparseable → fail open

  const start = to24(Number(match[1]), match[3]);
  const end = to24(Number(match[4]), match[6]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return true;

  const hour = now.getUTCHours();
  // Same-day window (e.g. 9–17). Overnight windows (start > end) are treated as
  // open across midnight.
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
