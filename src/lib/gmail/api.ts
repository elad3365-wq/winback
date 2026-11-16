import "server-only";

/**
 * Thin, typed wrappers over the Gmail REST API. Every call takes an access token
 * explicitly (so the caller owns refresh/rotation and tests can pass a fake) and
 * sets `Authorization: Bearer <token>` — which is NEVER logged or returned. Reads
 * use GET; sending/drafting/watch use POST. No scope beyond gmail.readonly +
 * gmail.send is required by the defaults here (createDraft needs gmail.compose
 * and is only called when that scope was granted).
 */

const GMAIL_API = "https://gmail.googleapis.com";

export class GmailApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function extractError(body: unknown, status: number): { code: string | null; message: string } {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (e && typeof e === "object") {
      const status2 = (e as Record<string, unknown>).status;
      const message = (e as Record<string, unknown>).message;
      return {
        code: typeof status2 === "string" ? status2 : null,
        message: typeof message === "string" ? message.slice(0, 300) : `HTTP ${status}`,
      };
    }
  }
  return { code: null, message: `HTTP ${status}` };
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: "GET" | "POST"; query?: Record<string, string | number | string[] | undefined>; json?: unknown },
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GMAIL_API}${path}`);
  if (url.origin !== GMAIL_API) throw new GmailApiError("Refusing to call a non-Gmail host.", 0, null);
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, `${item}`);
    else url.searchParams.set(k, `${v}`);
  }
  const res = await fetch(url.toString(), {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const { code, message } = extractError(body, res.status);
    throw new GmailApiError(`Gmail API ${path} failed: ${message}`, res.status, code);
  }
  return body as T;
}

// ---- Response shapes we rely on ----------------------------------------------

export type GmailProfile = { emailAddress: string; historyId: string; messagesTotal?: number };

export type GmailHeader = { name: string; value: string };
export type GmailPayloadPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayloadPart[];
};
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
};
export type GmailThread = { id: string; historyId?: string; messages?: GmailMessage[]; snippet?: string };
export type GmailThreadListItem = { id: string; snippet?: string; historyId?: string };
export type GmailThreadList = { threads?: GmailThreadListItem[]; nextPageToken?: string; resultSizeEstimate?: number };

export type GmailMessageListItem = { id: string; threadId: string };
export type GmailMessageList = {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailHistoryItem = {
  id: string;
  messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[];
};
export type GmailHistoryList = { history?: GmailHistoryItem[]; historyId?: string; nextPageToken?: string };

export type GmailSendResult = { id: string; threadId: string; labelIds?: string[] };
export type GmailDraft = { id: string; message?: { id: string; threadId: string } };
export type GmailWatchResult = { historyId: string; expiration: string };

// ---- Reads (gmail.readonly) --------------------------------------------------

export function getProfile(accessToken: string): Promise<GmailProfile> {
  return gmailFetch<GmailProfile>(accessToken, "/gmail/v1/users/me/profile");
}

export function listInboxThreads(
  accessToken: string,
  opts: { maxResults?: number; q?: string; pageToken?: string } = {},
): Promise<GmailThreadList> {
  return gmailFetch<GmailThreadList>(accessToken, "/gmail/v1/users/me/threads", {
    query: {
      labelIds: ["INBOX"],
      maxResults: opts.maxResults ?? 25,
      q: opts.q,
      pageToken: opts.pageToken,
    },
  });
}

/**
 * List recent INBOX MESSAGE ids (newest first). Message-level listing is the
 * reliable way to discover newly-arrived mail — it returns every inbox message
 * id regardless of read/unread state or how Gmail groups it into threads, and is
 * cleanly paginated via nextPageToken. Never filters on UNREAD.
 */
export function listInboxMessages(
  accessToken: string,
  opts: { maxResults?: number; q?: string; pageToken?: string } = {},
): Promise<GmailMessageList> {
  return gmailFetch<GmailMessageList>(accessToken, "/gmail/v1/users/me/messages", {
    query: {
      labelIds: ["INBOX"],
      maxResults: opts.maxResults ?? 100,
      q: opts.q,
      pageToken: opts.pageToken,
    },
  });
}

export function getThread(accessToken: string, threadId: string, format: "full" | "metadata" = "full"): Promise<GmailThread> {
  return gmailFetch<GmailThread>(accessToken, `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`, {
    query: { format },
  });
}

export function getMessage(accessToken: string, messageId: string, format: "full" | "metadata" = "full"): Promise<GmailMessage> {
  return gmailFetch<GmailMessage>(accessToken, `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`, {
    query: { format },
  });
}

export function listHistory(
  accessToken: string,
  opts: { startHistoryId: string; pageToken?: string },
): Promise<GmailHistoryList> {
  return gmailFetch<GmailHistoryList>(accessToken, "/gmail/v1/users/me/history", {
    query: {
      startHistoryId: opts.startHistoryId,
      historyTypes: "messageAdded",
      labelId: "INBOX",
      pageToken: opts.pageToken,
    },
  });
}

// ---- Sending (gmail.send) ----------------------------------------------------

export function sendRawMessage(accessToken: string, raw: string, threadId?: string): Promise<GmailSendResult> {
  return gmailFetch<GmailSendResult>(accessToken, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    json: threadId ? { raw, threadId } : { raw },
  });
}

// ---- Drafts (gmail.compose — optional) ---------------------------------------

export function createDraft(accessToken: string, raw: string, threadId?: string): Promise<GmailDraft> {
  return gmailFetch<GmailDraft>(accessToken, "/gmail/v1/users/me/drafts", {
    method: "POST",
    json: { message: threadId ? { raw, threadId } : { raw } },
  });
}

export function sendDraft(accessToken: string, draftId: string): Promise<GmailSendResult> {
  return gmailFetch<GmailSendResult>(accessToken, "/gmail/v1/users/me/drafts/send", {
    method: "POST",
    json: { id: draftId },
  });
}

// ---- Push notifications (users.watch / stop) ---------------------------------

export function watchMailbox(accessToken: string, topicName: string): Promise<GmailWatchResult> {
  return gmailFetch<GmailWatchResult>(accessToken, "/gmail/v1/users/me/watch", {
    method: "POST",
    json: { topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" },
  });
}

export function stopWatch(accessToken: string): Promise<unknown> {
  return gmailFetch<unknown>(accessToken, "/gmail/v1/users/me/stop", { method: "POST", json: {} });
}
