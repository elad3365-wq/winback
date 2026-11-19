import { describe, expect, it } from "vitest";

import { canGenerateDraft, resolveAiPolicy, utcDayStartIso } from "@/lib/ai/guard";

const base = resolveAiPolicy(null);

describe("resolveAiPolicy", () => {
  it("uses the safe column defaults when the business has no autonomy row", () => {
    expect(base).toEqual({ level: "draft", emergencyStop: false, dailyActionLimit: 200, dailySpendLimitUsd: 5 });
  });

  it("reads numeric strings from Postgres numeric columns and ignores unknown levels", () => {
    expect(resolveAiPolicy({ level: "bogus", daily_spend_limit_usd: "0.50", daily_action_limit: 3 })).toMatchObject({
      level: "draft",
      dailySpendLimitUsd: 0.5,
      dailyActionLimit: 3,
    });
  });
});

describe("canGenerateDraft", () => {
  const model = "claude-sonnet-5-5" as const;

  it("blocks manual and automatic drafts when AI is off", () => {
    const policy = { ...base, level: "off" as const };
    expect(canGenerateDraft({ policy, trigger: "manual", draftsToday: 0, model })).toMatchObject({ ok: false, reason: "ai_off" });
    expect(canGenerateDraft({ policy, trigger: "automatic", draftsToday: 0, model })).toMatchObject({ ok: false, reason: "ai_off" });
  });

  it("emergency stop halts automatic drafting but not a human click", () => {
    const policy = { ...base, emergencyStop: true };
    expect(canGenerateDraft({ policy, trigger: "automatic", draftsToday: 0, model })).toMatchObject({ reason: "emergency_stop" });
    expect(canGenerateDraft({ policy, trigger: "manual", draftsToday: 0, model })).toEqual({ ok: true });
  });

  it("enforces the daily action limit for automatic drafts only", () => {
    const policy = { ...base, dailyActionLimit: 2 };
    expect(canGenerateDraft({ policy, trigger: "automatic", draftsToday: 9, automaticDraftsToday: 2, model })).toMatchObject({
      reason: "action_limit",
    });
    expect(canGenerateDraft({ policy, trigger: "automatic", draftsToday: 9, automaticDraftsToday: 1, model })).toEqual({ ok: true });
    expect(canGenerateDraft({ policy, trigger: "manual", draftsToday: 9, model })).toEqual({ ok: true });
  });

  it("enforces the daily spend limit across all drafts (0 = paused)", () => {
    // Sonnet estimate ≈ $0.004/draft → $0.01 allows two drafts, not three.
    const policy = { ...base, dailySpendLimitUsd: 0.01 };
    expect(canGenerateDraft({ policy, trigger: "manual", draftsToday: 1, model })).toEqual({ ok: true });
    expect(canGenerateDraft({ policy, trigger: "manual", draftsToday: 2, model })).toMatchObject({ reason: "spend_limit" });
    expect(
      canGenerateDraft({ policy: { ...base, dailySpendLimitUsd: 0 }, trigger: "manual", draftsToday: 0, model }),
    ).toMatchObject({ reason: "spend_limit" });
  });
});

describe("utcDayStartIso", () => {
  it("returns UTC midnight of the given instant", () => {
    expect(utcDayStartIso(new Date("2026-11-19T23:30:00+02:00"))).toBe("2026-11-19T00:00:00.000Z");
    expect(utcDayStartIso(new Date("2026-11-20T01:30:00+02:00"))).toBe("2026-11-19T00:00:00.000Z");
  });
});
