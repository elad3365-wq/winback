import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/auth-destination";
import { isPublicPath, shouldForwardAuthCode } from "@/lib/supabase/paths";

describe("isPublicPath", () => {
  it("allows public pages and their sub-paths", () => {
    for (const p of ["/", "/login", "/signup", "/auth/callback", "/auth/confirm", "/privacy", "/terms"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("lets self-authenticated machine endpoints through", () => {
    expect(isPublicPath("/api/cron/followups")).toBe(true);
    expect(isPublicPath("/api/cron/gmail-maintenance")).toBe(true);
    expect(isPublicPath("/api/gmail/push")).toBe(true);
    // Verifies its own signed state + session; must not bounce Google's code to /login.
    expect(isPublicPath("/api/gmail/callback")).toBe(true);
    expect(isPublicPath("/api/gmail/callbackx")).toBe(false);
  });

  it("keeps app pages and user API routes protected", () => {
    for (const p of [
      "/dashboard",
      "/leads",
      "/settings",
      "/onboarding",
      "/api/gmail/connect",
      "/api/leads/123/ai-followup",
    ]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("does not treat look-alike prefixes as public", () => {
    expect(isPublicPath("/authority")).toBe(false);
    expect(isPublicPath("/login-admin")).toBe(false);
    expect(isPublicPath("/termsx")).toBe(false);
    expect(isPublicPath("/api/cronjobs")).toBe(false);
  });
});

describe("shouldForwardAuthCode", () => {
  it("forwards a stray Supabase code on a page", () => {
    expect(shouldForwardAuthCode("/", true)).toBe(true);
    expect(shouldForwardAuthCode("/dashboard", true)).toBe(true);
  });
  it("never hijacks the Gmail OAuth callback or other API routes", () => {
    expect(shouldForwardAuthCode("/api/gmail/callback", true)).toBe(false);
  });
  it("leaves /auth routes and code-less requests alone", () => {
    expect(shouldForwardAuthCode("/auth/callback", true)).toBe(false);
    expect(shouldForwardAuthCode("/dashboard", false)).toBe(false);
  });
});

describe("safeNext", () => {
  it("accepts internal paths", () => {
    expect(safeNext("/leads?status=new")).toBe("/leads?status=new");
  });
  it("rejects external and protocol-relative targets", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("/\tevil")).toBeNull();
  });
  it("rejects auth-only pages", () => {
    expect(safeNext("/login")).toBeNull();
    expect(safeNext("/auth/callback")).toBeNull();
  });
});
