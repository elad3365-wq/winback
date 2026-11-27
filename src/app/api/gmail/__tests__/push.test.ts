import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Gmail Pub/Sub webhook: auth, mailbox lookup, multi-business, no error leakage. */

const lookup: { data: unknown; error: unknown } = { data: [], error: null };
const ilikeArgs: [string, string][] = [];
const processHistory = vi.fn();
const drainQueue = vi.fn();

vi.mock("@/lib/gmail/config", () => ({
  isGmailFeatureEnabled: () => true,
  isGmailPushConfigured: () => true,
  gmailPushToken: () => "push-secret-123",
}));
vi.mock("@/lib/gmail/history", () => ({ processHistory: (...a: unknown[]) => processHistory(...a) }));
vi.mock("@/lib/ai/autopilot/worker", () => ({ drainQueue: (...a: unknown[]) => drainQueue(...a) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.ilike = (col: string, val: string) => (ilikeArgs.push([col, val]), chain);
      chain.is = () => Promise.resolve(lookup);
      return chain;
    },
  }),
}));

import { POST } from "@/app/api/gmail/push/route";

function envelope(emailAddress: string) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId: "123" })).toString("base64");
  return { message: { data, messageId: "1" }, subscription: "projects/p/subscriptions/s" };
}

function req(token: string | null, body: unknown) {
  const url = `https://app.test/api/gmail/push${token ? `?token=${token}` : ""}`;
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  lookup.data = [];
  lookup.error = null;
  ilikeArgs.length = 0;
  processHistory.mockReset();
  drainQueue.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/gmail/push", () => {
  it("rejects a missing or wrong token", async () => {
    expect((await POST(req(null, envelope("a@b.com")))).status).toBe(401);
    expect((await POST(req("push-secret-12X", envelope("a@b.com")))).status).toBe(401);
    expect(processHistory).not.toHaveBeenCalled();
  });

  it("ACKs a malformed envelope without processing", async () => {
    const res = await POST(req("push-secret-123", { nope: true }));
    expect(res.status).toBe(200);
    expect(processHistory).not.toHaveBeenCalled();
  });

  it("looks the mailbox up with LIKE wildcards escaped", async () => {
    await POST(req("push-secret-123", envelope("Info_Sales@Example.com")));
    expect(ilikeArgs).toEqual([["google_account_email", "info\\_sales@example.com"]]);
  });

  it("processes every business that connected the same mailbox", async () => {
    lookup.data = [{ business_id: "b1" }, { business_id: "b2" }];
    processHistory.mockResolvedValue({ mode: "incremental", stored: 1 });
    drainQueue.mockResolvedValue({ processed: 2 });
    const res = await POST(req("push-secret-123", envelope("owner@example.com")));
    expect(res.status).toBe(200);
    expect(processHistory.mock.calls.map((c) => c[0])).toEqual(["b1", "b2"]);
    expect(await res.json()).toMatchObject({ ok: true, businesses: 2, stored: 2, failed: 0 });
  });

  it("keeps going when one business fails, and retries (500) only when all fail — without leaking errors", async () => {
    lookup.data = [{ business_id: "b1" }, { business_id: "b2" }];
    processHistory.mockRejectedValueOnce(new Error("token for b1 is secret-ish")).mockResolvedValueOnce({ mode: "incremental", stored: 0 });
    drainQueue.mockResolvedValue({});
    expect((await POST(req("push-secret-123", envelope("owner@example.com")))).status).toBe(200);

    processHistory.mockReset();
    processHistory.mockRejectedValue(new Error("internal detail"));
    const res = await POST(req("push-secret-123", envelope("owner@example.com")));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("internal detail");
  });

  it("ACKs an unknown mailbox", async () => {
    const res = await POST(req("push-secret-123", envelope("stranger@example.com")));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "unknown_mailbox" });
  });
});
