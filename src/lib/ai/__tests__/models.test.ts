import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOLLOWUP_MODEL,
  isSupportedFollowupModel,
  resolveFollowupModel,
  SUPPORTED_FOLLOWUP_MODELS,
} from "@/lib/ai/models";

describe("resolveFollowupModel", () => {
  it("defaults to the cost-efficient model when unset", () => {
    expect(resolveFollowupModel({})).toBe(DEFAULT_FOLLOWUP_MODEL);
    expect(DEFAULT_FOLLOWUP_MODEL).toBe("claude-sonnet-5-5");
  });

  it("uses a supported override", () => {
    expect(
      resolveFollowupModel({ WINBACK_FOLLOWUP_MODEL: "claude-haiku-5-5" }),
    ).toBe("claude-haiku-5-5");
    expect(
      resolveFollowupModel({ WINBACK_FOLLOWUP_MODEL: "claude-opus-5-5" }),
    ).toBe("claude-opus-5-5");
  });

  it("trims whitespace around a supported override", () => {
    expect(
      resolveFollowupModel({ WINBACK_FOLLOWUP_MODEL: "  claude-haiku-5-5  " }),
    ).toBe("claude-haiku-5-5");
  });

  it("falls back to the default for an unknown or invalid value (never sends a bad id)", () => {
    for (const bad of ["gpt-4o", "claude-opus-5", "claude-2", "", "   "]) {
      expect(
        resolveFollowupModel({ WINBACK_FOLLOWUP_MODEL: bad }),
      ).toBe(DEFAULT_FOLLOWUP_MODEL);
    }
  });

  it("only resolves to allowlisted models", () => {
    expect(SUPPORTED_FOLLOWUP_MODELS).toContain(resolveFollowupModel({}));
  });
});

describe("isSupportedFollowupModel", () => {
  it("accepts allowlisted ids and rejects everything else", () => {
    expect(isSupportedFollowupModel("claude-sonnet-5-5")).toBe(true);
    expect(isSupportedFollowupModel("claude-opus-5")).toBe(false);
    expect(isSupportedFollowupModel(undefined)).toBe(false);
    expect(isSupportedFollowupModel(42)).toBe(false);
  });
});
