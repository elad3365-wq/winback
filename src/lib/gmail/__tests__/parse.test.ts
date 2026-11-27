import { describe, expect, it } from "vitest";

import type { GmailMessage } from "@/lib/gmail/api";
import {
  buildRawReply,
  buildReferences,
  decodeBase64Url,
  encodeBase64Url,
  extractEmailAddress,
  parseMessage,
  parsePubSubPush,
  replySubject,
} from "@/lib/gmail/parse";

describe("base64url + address helpers", () => {
  it("round-trips base64url", () => {
    const s = "Hello, world! <>&?/+=";
    expect(decodeBase64Url(encodeBase64Url(s))).toBe(s);
  });

  it("extracts an address from a From header", () => {
    expect(extractEmailAddress("Dana Lopez <dana@example.com>")).toBe("dana@example.com");
    expect(extractEmailAddress("bare@example.com")).toBe("bare@example.com");
    expect(extractEmailAddress(null)).toBeNull();
  });
});

describe("parseMessage", () => {
  it("pulls headers, body, and threading fields", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "hi there",
      internalDate: String(Date.UTC(2026, 0, 2, 3, 4, 5)),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Dana <dana@example.com>" },
          { name: "To", value: "shop@biz.com" },
          { name: "Subject", value: "Quote question" },
          { name: "Message-ID", value: "<abc@mail>" },
        ],
        body: { data: encodeBase64Url("Can you do it next week?") },
      },
    };
    const p = parseMessage(msg);
    expect(p.fromAddress).toBe("dana@example.com");
    expect(p.to).toEqual(["shop@biz.com"]);
    expect(p.subject).toBe("Quote question");
    expect(p.rfc822MessageId).toBe("<abc@mail>");
    expect(p.bodyText).toContain("next week");
    expect(p.unread).toBe(true);
    expect(p.date).toBe(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)).toISOString());
  });
});

describe("reply building", () => {
  it("prefixes Re: once", () => {
    expect(replySubject("Hello")).toBe("Re: Hello");
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
    expect(replySubject(null)).toBe("Re:");
  });

  it("chains References for threading", () => {
    expect(buildReferences("<a@x>", "<b@x>")).toBe("<a@x> <b@x>");
    expect(buildReferences(null, "<b@x>")).toBe("<b@x>");
    expect(buildReferences(null, null)).toBeNull();
  });

  it("builds an RFC822 reply that decodes back to its headers + body", () => {
    const raw = buildRawReply({
      from: "shop@biz.com",
      to: ["dana@example.com"],
      subject: "Re: Quote question",
      inReplyTo: "<abc@mail>",
      references: "<abc@mail>",
      body: "Happy to help — next week works.",
    });
    const decoded = decodeBase64Url(raw);
    expect(decoded).toContain("From: shop@biz.com");
    expect(decoded).toContain("To: dana@example.com");
    expect(decoded).toContain("In-Reply-To: <abc@mail>");
    expect(decoded).toContain("Happy to help");
  });
});

describe("parsePubSubPush", () => {
  it("decodes a valid envelope", () => {
    const inner = encodeBase64Url(JSON.stringify({ emailAddress: "shop@biz.com", historyId: 42 }));
    expect(parsePubSubPush({ message: { data: inner } })).toEqual({ emailAddress: "shop@biz.com", historyId: "42" });
  });
  it("returns null for junk", () => {
    expect(parsePubSubPush(null)).toBeNull();
    expect(parsePubSubPush({})).toBeNull();
    expect(parsePubSubPush({ message: { data: "!!!notjson" } })).toBeNull();
  });
});
