import { afterEach, describe, expect, it, vi } from "vitest";

/** Day-4 Gmail hardening: scopes, LIKE escaping, error mapping, reply review, token refresh. */

const adminState: { row: Record<string, unknown> | null; updates: unknown[] } = { row: null, updates: [] };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: adminState.row, error: null });
      chain.update = (payload: unknown) => {
        adminState.updates.push(payload);
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    },
  }),
}));

import { GmailApiError } from "@/lib/gmail/api";
import { GMAIL_SCOPE_READONLY, GMAIL_SCOPE_SEND, hasRequiredGmailScopes } from "@/lib/gmail/config";
import { GmailReconnectRequiredError, getAccessToken, isInvalidGrant } from "@/lib/gmail/connection";
import { encryptWithKey, deriveKey } from "@/lib/gmail/crypto";
import { gmailErrorMessage } from "@/lib/gmail/errors";
import { escapeLikePattern } from "@/lib/gmail/parse";
import { finalizeReply, type ReplyInputs } from "@/lib/gmail/reply";
import { gmailThreadUrl } from "@/components/settings/email-inbox";

function inputs(overrides: Partial<ReplyInputs> = {}): ReplyInputs {
  return {
    businessName: "Coastline Plumbing",
    businessType: "plumbing",
    financingAvailable: false,
    paymentPlansAvailable: false,
    maximumDiscountPercent: 0,
    aiCanOfferDiscounts: false,
    businessHours: "Mon–Fri 8am–5pm",
    additionalRules: null,
    tone: "friendly",
    currency: "USD",
    inbound: { fromName: "Dana", subject: "Price?", bodyText: "How much is a drain cleaning?" },
    lead: null,
    knowledge: ["Drain cleaning: $149 flat fee"],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  adminState.row = null;
  adminState.updates = [];
});

describe("hasRequiredGmailScopes", () => {
  it("requires gmail.readonly when Google reports scopes", () => {
    expect(hasRequiredGmailScopes(`${GMAIL_SCOPE_READONLY} ${GMAIL_SCOPE_SEND}`)).toBe(true);
    expect(hasRequiredGmailScopes(GMAIL_SCOPE_READONLY)).toBe(true);
    expect(hasRequiredGmailScopes(GMAIL_SCOPE_SEND)).toBe(false);
    expect(hasRequiredGmailScopes("openid email")).toBe(false);
  });
  it("treats a missing scope field as granted", () => {
    expect(hasRequiredGmailScopes(undefined)).toBe(true);
    expect(hasRequiredGmailScopes("")).toBe(true);
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so an address only matches itself", () => {
    expect(escapeLikePattern("info_sales@x.com")).toBe("info\\_sales@x.com");
    expect(escapeLikePattern("a%b@x.com")).toBe("a\\%b@x.com");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("plain@x.com")).toBe("plain@x.com");
  });
});

describe("gmailErrorMessage", () => {
  it("maps Google errors to owner-safe text without raw details", () => {
    expect(gmailErrorMessage(new GmailApiError("Gmail API /x failed: Invalid Credentials", 401, null))).toMatch(/reconnect/i);
    expect(gmailErrorMessage(new GmailApiError("secret detail", 403, null))).toMatch(/Reconnect Gmail/);
    expect(gmailErrorMessage(new GmailApiError("x", 429, null))).toMatch(/rate-limiting/);
    expect(gmailErrorMessage(new GmailApiError("x", 503, null))).toMatch(/temporarily unavailable/);
    expect(gmailErrorMessage(new Error("Inbox sync requires SUPABASE_SERVICE_ROLE_KEY"))).not.toMatch(/SUPABASE/);
    expect(gmailErrorMessage(new Error("duplicate key value violates unique constraint"), "fallback")).toBe("fallback");
  });
  it("passes the reconnect message through", () => {
    expect(gmailErrorMessage(new GmailReconnectRequiredError())).toMatch(/reconnect your Gmail/);
  });
});

describe("isInvalidGrant", () => {
  it("recognises Google's revoked/expired refresh token error", () => {
    expect(isInvalidGrant(new Error("Google token request failed (invalid_grant: Token has been expired or revoked.)."))).toBe(true);
    expect(isInvalidGrant(new Error("Google token request failed (invalid_grant)."))).toBe(true);
    expect(isInvalidGrant(new Error("Google token request failed (invalid_client)."))).toBe(false);
  });
});

describe("getAccessToken", () => {
  const KEY = "a".repeat(64);
  function stubEnv() {
    vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_GMAIL_CLIENT_SECRET", "csecret");
    vi.stubEnv("GOOGLE_GMAIL_REDIRECT_URI", "https://example.test/api/gmail/callback");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
  }

  it("asks the owner to reconnect when Google revoked the grant", async () => {
    stubEnv();
    adminState.row = {
      business_id: "b1",
      access_token_encrypted: encryptWithKey("old", deriveKey(KEY)),
      refresh_token_encrypted: encryptWithKey("refresh", deriveKey(KEY)),
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      revoked_at: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 })),
    );
    await expect(getAccessToken("b1")).rejects.toBeInstanceOf(GmailReconnectRequiredError);
    expect(adminState.updates).toHaveLength(0);
  });

  it("refreshes and caches an expired access token", async () => {
    stubEnv();
    adminState.row = {
      business_id: "b1",
      access_token_encrypted: encryptWithKey("old", deriveKey(KEY)),
      refresh_token_encrypted: encryptWithKey("refresh", deriveKey(KEY)),
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      scope: GMAIL_SCOPE_READONLY,
      revoked_at: null,
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 })));
    expect(await getAccessToken("b1")).toBe("fresh");
    expect(adminState.updates).toHaveLength(1);
    // Stored encrypted, never in plain text.
    expect(JSON.stringify(adminState.updates[0])).not.toContain('"fresh"');
  });

  it("asks to reconnect when there is no connection", async () => {
    stubEnv();
    adminState.row = null;
    await expect(getAccessToken("b1")).rejects.toBeInstanceOf(GmailReconnectRequiredError);
  });
});

describe("finalizeReply (output review on email replies)", () => {
  it("does not flag a price that is in the knowledge base", () => {
    const out = finalizeReply("Hi Dana! Drain cleaning is $149 flat. Want us to come by?", inputs());
    expect(out.flags).toEqual([]);
    expect(out.content).toContain("$149");
  });

  it("flags an invented price, guarantee and time slot", () => {
    const out = finalizeReply(
      "Hi Dana! Drain cleaning is $99 this week. It comes with a lifetime guarantee. We have an opening Friday at 9am.",
      inputs(),
    );
    const kinds = out.flags.map((f) => f.kind);
    expect(kinds).toContain("unverified_price");
    expect(kinds).toContain("unverified_guarantee");
    expect(kinds).toContain("availability_claim");
  });

  it("removes a discount when the business does not allow discounts", () => {
    const out = finalizeReply("Hi Dana! Drain cleaning is $149. I can give you 20% off if you book today.", inputs());
    expect(out.content).not.toMatch(/20%/);
    expect(out.discountOffered).toBe(false);
  });

  it("removes a discount above the ceiling but keeps one within it", () => {
    const allow = inputs({ aiCanOfferDiscounts: true, maximumDiscountPercent: 10 });
    expect(finalizeReply("Thanks Dana. We can do 25% off this month.", allow).content).not.toMatch(/25%/);
    const ok = finalizeReply("Thanks Dana. We can do 10% off this month.", allow);
    expect(ok.content).toMatch(/10%/);
    expect(ok.discountOffered).toBe(true);
  });

  it("treats the linked lead's estimate as a verified price", () => {
    const out = finalizeReply("Hi Dana, your estimate was $2,400.", inputs({ knowledge: [], lead: { customerName: "Dana", service: "Repipe", estimateAmount: 2400 } }));
    expect(out.flags).toEqual([]);
  });
});

describe("gmailThreadUrl", () => {
  it("links to the thread in the connected account", () => {
    expect(gmailThreadUrl("18c2f0a1b2", "owner@biz.com")).toBe("https://mail.google.com/mail/u/?authuser=owner%40biz.com#all/18c2f0a1b2");
  });
  it("refuses anything that isn't a Gmail thread id", () => {
    expect(gmailThreadUrl(null, "a@b.c")).toBeNull();
    expect(gmailThreadUrl("javascript:alert(1)", null)).toBeNull();
  });
});
