/**
 * Helpers for the Gmail-free "assisted" workflow: the owner sends an approved
 * message from their own phone or email, so WinBack only prepares a deep link.
 */

/** `sms:` deep link that opens the phone's Messages app with the text filled in. */
export function smsHref(phone: string, body: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!/\d{5,}/.test(digits.replace(/\+/g, ""))) return null;
  // "?&body=" is understood by both iOS and Android.
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}
