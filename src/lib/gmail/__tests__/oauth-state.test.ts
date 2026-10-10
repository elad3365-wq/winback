import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createState, verifyState } from "@/lib/gmail/oauth-state";

const saved = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});
afterEach(() => {
  if (saved === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = saved;
});

describe("signed OAuth state", () => {
  it("round-trips the business + user", () => {
    const state = createState("biz-1", "user-1");
    const payload = verifyState(state);
    expect(payload?.businessId).toBe("biz-1");
    expect(payload?.userId).toBe("user-1");
  });

  it("rejects a tampered payload", () => {
    const state = createState("biz-1", "user-1");
    const [, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ businessId: "biz-EVIL", userId: "user-1", iat: Date.now(), nonce: "x" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a state signed with a different key", () => {
    const state = createState("biz-1", "user-1");
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex"); // key rotated
    expect(verifyState(state)).toBeNull();
  });

  it("rejects malformed / empty input", () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("no-dot")).toBeNull();
    expect(verifyState(".onlydot")).toBeNull();
  });
});
