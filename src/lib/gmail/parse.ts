/**
 * Pure helpers for decoding Gmail messages, building RFC822 replies, and parsing
 * Pub/Sub push envelopes. No secrets, no I/O — kept dependency-free so they can
 * be unit-tested directly.
 */

import type { GmailHeader, GmailMessage, GmailPayloadPart } from "@/lib/gmail/api";

export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === lower);
  return found ? found.value : null;
}

/** Extract the first email address from a header value like `"Name <a@b.com>"`. */
export function extractEmailAddress(value: string | null): string | null {
  if (!value) return null;
  const angle = value.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = value.match(/[^\s<>",;]+@[^\s<>",;]+/);
  return bare ? bare[0].trim().toLowerCase() : null;
}

/** Split a To/Cc header into individual addresses. */
export function splitAddresses(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((p) => extractEmailAddress(p))
    .filter((a): a is string => Boolean(a));
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Walk a MIME payload tree and return the best plain-text body we can find. */
export function extractPlainText(payload: GmailPayloadPart | undefined): string {
  if (!payload) return "";
  const texts: string[] = [];
  let htmlFallback = "";

  const walk = (part: GmailPayloadPart) => {
    const mime = part.mimeType ?? "";
    if (mime === "text/plain" && part.body?.data) {
      texts.push(decodeBase64Url(part.body.data));
    } else if (mime === "text/html" && part.body?.data && !htmlFallback) {
      htmlFallback = stripHtml(decodeBase64Url(part.body.data));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  const plain = texts.join("\n").trim();
  return plain || htmlFallback;
}

export type ParsedMessage = {
  id: string;
  threadId: string;
  from: string | null;
  fromAddress: string | null;
  to: string[];
  subject: string | null;
  snippet: string | null;
  date: string | null; // ISO
  rfc822MessageId: string | null; // the Message-ID header
  inReplyTo: string | null;
  references: string | null;
  bodyText: string;
  labelIds: string[];
  unread: boolean;
};

export function parseMessage(msg: GmailMessage): ParsedMessage {
  const headers = msg.payload?.headers;
  const from = getHeader(headers, "From");
  const dateMs = msg.internalDate ? Number(msg.internalDate) : NaN;
  const labelIds = msg.labelIds ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from,
    fromAddress: extractEmailAddress(from),
    to: splitAddresses(getHeader(headers, "To")),
    subject: getHeader(headers, "Subject"),
    snippet: msg.snippet ?? null,
    date: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null,
    rfc822MessageId: getHeader(headers, "Message-ID") ?? getHeader(headers, "Message-Id"),
    inReplyTo: getHeader(headers, "In-Reply-To"),
    references: getHeader(headers, "References"),
    bodyText: extractPlainText(msg.payload),
    labelIds,
    unread: labelIds.includes("UNREAD"),
  };
}

/** The reply Subject: keep the original, prefixing `Re: ` once. */
export function replySubject(subject: string | null): string {
  const s = (subject ?? "").trim();
  if (!s) return "Re:";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Build the References header for a reply, per RFC 5322 threading. */
export function buildReferences(parentReferences: string | null, parentMessageId: string | null): string | null {
  const parts = [parentReferences, parentMessageId].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(" ") : null;
}

export type ReplyEnvelope = {
  from: string;
  to: string[];
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  body: string;
};

/** Build a base64url-encoded RFC822 message for messages.send / drafts.create. */
export function buildRawReply(env: ReplyEnvelope): string {
  const lines: string[] = [];
  lines.push(`From: ${env.from}`);
  lines.push(`To: ${env.to.join(", ")}`);
  lines.push(`Subject: ${env.subject}`);
  if (env.inReplyTo) lines.push(`In-Reply-To: ${env.inReplyTo}`);
  if (env.references) lines.push(`References: ${env.references}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(env.body);
  return encodeBase64Url(lines.join("\r\n"));
}

export type PubSubNotification = { emailAddress: string; historyId: string };

/**
 * Parse a Gmail Pub/Sub push envelope. The POST body is
 * `{ message: { data: <base64 JSON>, messageId, ... }, subscription }`; the inner
 * JSON is `{ emailAddress, historyId }`. Returns null if anything is malformed.
 */
export function parsePubSubPush(body: unknown): PubSubNotification | null {
  if (!body || typeof body !== "object") return null;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const data = (message as { data?: unknown }).data;
  if (typeof data !== "string" || data.length === 0) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeBase64Url(data));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;
  const emailAddress = (decoded as Record<string, unknown>).emailAddress;
  const historyId = (decoded as Record<string, unknown>).historyId;
  if (typeof emailAddress !== "string") return null;
  const hist = typeof historyId === "string" ? historyId : typeof historyId === "number" ? String(historyId) : null;
  if (!hist) return null;
  return { emailAddress, historyId: hist };
}
