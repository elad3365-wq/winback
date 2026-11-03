import { describe, expect, it } from "vitest";

import {
  autonomyFromLegacyMode,
  decideAutonomy,
  DEFAULT_AUTONOMY_LEVEL,
  type AutonomyContext,
} from "@/lib/ai/autopilot/autonomy";

const ctx = (over: Partial<AutonomyContext> = {}): AutonomyContext => ({ level: "draft", ...over });

describe("decideAutonomy", () => {
  it("defaults to draft and never silently upgrades", () => {
    expect(DEFAULT_AUTONOMY_LEVEL).toBe("draft");
  });

  it("OFF blocks everything", () => {
    expect(decideAutonomy("classify", ctx({ level: "off" })).decision).toBe("blocked");
    expect(decideAutonomy("draft_reply", ctx({ level: "off" })).decision).toBe("blocked");
  });

  it("read-only analysis is always allowed while on (even under emergency stop)", () => {
    expect(decideAutonomy("classify", ctx({ level: "assist" })).decision).toBe("allow");
    expect(decideAutonomy("summarize", ctx({ level: "draft", emergencyStop: true })).decision).toBe("allow");
  });

  it("emergency stop blocks all non-read actions", () => {
    expect(decideAutonomy("draft_followup", ctx({ emergencyStop: true })).decision).toBe("blocked");
    expect(decideAutonomy("send_email", ctx({ level: "autopilot", emergencyStop: true, sendingEnabled: true })).decision).toBe("blocked");
  });

  it("high-impact actions always require approval", () => {
    for (const lvl of ["assist", "draft", "autopilot"] as const) {
      expect(decideAutonomy("refund", ctx({ level: lvl })).decision).toBe("needs_approval");
      expect(decideAutonomy("data_deletion", ctx({ level: lvl })).decision).toBe("needs_approval");
    }
  });

  it("external comms need approval unless autopilot + sending enabled + authorized", () => {
    expect(decideAutonomy("send_email", ctx({ level: "draft", sendingEnabled: true })).decision).toBe("needs_approval");
    expect(decideAutonomy("send_email", ctx({ level: "autopilot", sendingEnabled: false, workflowAuthorized: true })).decision).toBe("needs_approval");
    expect(decideAutonomy("send_email", ctx({ level: "autopilot", sendingEnabled: true, workflowAuthorized: false })).decision).toBe("needs_approval");
    expect(decideAutonomy("send_email", ctx({ level: "autopilot", sendingEnabled: true, workflowAuthorized: true })).decision).toBe("allow");
  });

  it("internal actions: assist needs approval, draft/autopilot allow", () => {
    expect(decideAutonomy("update_crm", ctx({ level: "assist" })).decision).toBe("needs_approval");
    expect(decideAutonomy("draft_followup", ctx({ level: "draft" })).decision).toBe("allow");
    expect(decideAutonomy("schedule_followup", ctx({ level: "autopilot" })).decision).toBe("allow");
  });
});

describe("autonomyFromLegacyMode", () => {
  it("maps legacy autopilot_mode without upgrading", () => {
    expect(autonomyFromLegacyMode("manual", true)).toBe("draft");
    expect(autonomyFromLegacyMode("assisted", true)).toBe("assist");
    expect(autonomyFromLegacyMode("full", true)).toBe("autopilot");
    expect(autonomyFromLegacyMode("full", false)).toBe("off"); // disabled wins
    expect(autonomyFromLegacyMode(null, true)).toBe("draft");
  });
});
