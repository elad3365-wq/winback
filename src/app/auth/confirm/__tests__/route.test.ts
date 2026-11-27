import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));
vi.mock("@/lib/auth-destination", () => ({
  destinationAfterAuth: vi.fn(async () => "/onboarding"),
  safeNext: (n: string | null) => n,
}));

import { GET } from "../route";

function get(query: string) {
  return GET(new NextRequest(`https://winback.test/auth/confirm${query}`));
}

describe("/auth/confirm", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("signs in a confirmed signup that arrives with a PKCE code (default email template)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await get("?next=/onboarding&code=abc");
    expect(res.headers.get("location")).toBe("https://winback.test/onboarding");
  });

  it("tells a signup opened on another device that the email is confirmed", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { code: "bad_code_verifier", status: 400 } });
    const res = await get("?next=/onboarding&code=abc");
    expect(res.headers.get("location")).toBe("https://winback.test/login?status=email_confirmed");
  });

  it("sends a recovery code to the reset page, and a failed one to a fresh-link error", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    expect((await get("?next=/reset-password&code=abc")).headers.get("location")).toBe(
      "https://winback.test/reset-password",
    );
    exchangeCodeForSession.mockResolvedValueOnce({ data: { user: null }, error: { code: "x", status: 400 } });
    expect((await get("?next=/reset-password&code=abc")).headers.get("location")).toBe(
      "https://winback.test/login?error=link",
    );
  });

  it("still verifies token_hash links (custom template)", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await get("?token_hash=t&type=signup&next=/onboarding");
    expect(res.headers.get("location")).toBe("https://winback.test/onboarding");
  });

  it("rejects a link with neither", async () => {
    expect((await get("")).headers.get("location")).toBe("https://winback.test/login?error=link");
  });
});
