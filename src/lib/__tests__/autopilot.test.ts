import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTOPILOT_SETTINGS,
  delayMinutesForFollowup,
  isAiTone,
  isAutopilotMode,
  type AutopilotSettings,
} from "@/lib/autopilot";

describe("delayMinutesForFollowup", () => {
  const settings: AutopilotSettings = {
    ...DEFAULT_AUTOPILOT_SETTINGS,
    first_followup_delay_minutes: 60,
    second_followup_delay_minutes: 1440,
    third_followup_delay_minutes: 4320,
  };

  it("maps follow-up number to the configured delay", () => {
    expect(delayMinutesForFollowup(settings, 1)).toBe(60);
    expect(delayMinutesForFollowup(settings, 2)).toBe(1440);
    expect(delayMinutesForFollowup(settings, 3)).toBe(4320);
  });

  it("clamps numbers at or below 1 to the first delay and beyond 3 to the third", () => {
    expect(delayMinutesForFollowup(settings, 0)).toBe(60);
    expect(delayMinutesForFollowup(settings, -5)).toBe(60);
    expect(delayMinutesForFollowup(settings, 4)).toBe(4320);
    expect(delayMinutesForFollowup(settings, 99)).toBe(4320);
  });
});

describe("autopilot guards", () => {
  it("validates mode values", () => {
    expect(isAutopilotMode("manual")).toBe(true);
    expect(isAutopilotMode("assisted")).toBe(true);
    expect(isAutopilotMode("full")).toBe(true);
    expect(isAutopilotMode("turbo")).toBe(false);
    expect(isAutopilotMode(undefined)).toBe(false);
  });

  it("validates tone values", () => {
    expect(isAiTone("professional")).toBe(true);
    expect(isAiTone("premium")).toBe(true);
    expect(isAiTone("sarcastic")).toBe(false);
    expect(isAiTone(5)).toBe(false);
  });

  it("ships a conservative default (disabled, manual)", () => {
    expect(DEFAULT_AUTOPILOT_SETTINGS.autopilot_enabled).toBe(false);
    expect(DEFAULT_AUTOPILOT_SETTINGS.autopilot_mode).toBe("manual");
  });
});
