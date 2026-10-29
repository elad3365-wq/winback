/**
 * Pure helpers for reading Gmail API messages and writing replies. No network
 * and no secrets here, so they are unit tested on their own.
 */

export type GmailHeader = { name: string; value: string };

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

export type ParsedInbound = {
  gmailMessageId: string;
  gmailThreadId: string;
  rfc822MessageId: string | null;
  references: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddress: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: string;
  /** Mailing lists, bulk mail and auto-replies: stored, never auto-drafted. */
  isAutomated: boolean;
};

/** The body is stored for the AI and the inbox view; cap it so one huge email cannot bloat a row. */
export const MAX_BODY_CHARS = 20_000;

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function header(part: GmailPart | undefined, name: string): string | null {
  const wanted = name.toLowerCase();
  const found = part?.headers?.find((h) => h.name.toLowerCase() === wanted);
  return found ? found.value : null;
}

/** Splits `"Dana Whitfield" <dana@example.com>` into name and lower-cased address. */
export function parseAddress(value: string | null): { address: string; name: string | null } | null {
  if (!value) return null;
  const angle = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angle) {
    const name = value
      .slice(0, angle.index)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    return { address: angle[1].toLowerCase(), name: name || null };
  }
  const bare = value.match(/([^\s<>,;"]+@[^\s<>,;"]+)/);
  return bare ? { address: bare[1].toLowerCase(), name: null } : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function findPart(part: GmailPart | undefined, mimeType: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/**
 * Drops the quoted history under a reply ("On Tue, Dana wrote:" and "> "
 * lines) so the AI answers what the customer just said, not the whole thread.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Plain-text body: text/plain if present, otherwise text/html with tags removed. */
export function extractBodyText(payload: GmailPart | undefined): string | null {
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data).trim();
  const html = findPart(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  return null;
}

export function isAutomatedMessage(payload: GmailPart | undefined, fromAddress: string): boolean {
  if (header(payload, "List-Unsubscribe") || header(payload, "List-Id")) return true;
  const precedence = header(payload, "Precedence")?.toLowerCase();
  if (precedence && ["bulk", "list", "junk", "auto_reply"].includes(precedence)) return true;
  const autoSubmitted = header(payload, "Auto-Submitted")?.toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?)@/i.test(fromAddress);
}

export function parseInbound(message: GmailMessage): ParsedInbound | null {
  const payload = message.payload;
  const from = parseAddress(header(payload, "From"));
  if (!from) return null;
  const to = parseAddress(header(payload, "To"));
  const body = extractBodyText(payload);
  const millis = Number(message.internalDate);

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    rfc822MessageId: header(payload, "Message-ID") ?? header(payload, "Message-Id"),
    references: header(payload, "References"),
    fromAddress: from.address,
    fromName: from.name,
    toAddress: to?.address ?? null,
    subject: header(payload, "Subject"),
    snippet: message.snippet ? decodeEntities(message.snippet) : null,
    bodyText: body ? stripQuotedReply(body).slice(0, MAX_BODY_CHARS) || body.slice(0, MAX_BODY_CHARS) : null,
    receivedAt: Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : new Date().toISOString(),
    isAutomated: isAutomatedMessage(payload, from.address),
  };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function replySubject(subject: string | null): string {
  const base = (subject ?? "").trim();
  if (!base) return "Re: your estimate";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

/** Header values must never carry a line break, or a body could inject headers. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoding for non-ASCII subjects. */
function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(value.trim());
}

/**
 * Builds the raw RFC 5322 reply that Gmail's send endpoint takes, threaded
 * under the customer's email with In-Reply-To and References.
 */
export function buildReplyMime(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string | null;
}): string {
  const from = headerSafe(input.from);
  const to = headerSafe(input.to);
  if (!isEmailAddress(from) || !isEmailAddress(to)) {
    throw new Error("Invalid sender or recipient address.");
  }

  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(headerSafe(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  const inReplyTo = input.inReplyTo ? headerSafe(input.inReplyTo) : null;
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    const refs = [input.references ? headerSafe(input.references) : "", inReplyTo]
      .filter(Boolean)
      .join(" ");
    lines.push(`References: ${refs}`);
  }

  const body = Buffer.from(input.body.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

  return encodeBase64Url(`${lines.join("\r\n")}\r\n\r\n${body}`);
}
