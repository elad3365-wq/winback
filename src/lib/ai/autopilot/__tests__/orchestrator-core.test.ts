import { describe, expect, it } from "vitest";

import type { AutonomyContext } from "@/lib/ai/autopilot/autonomy";
import { decideNextAction, type LeadFacts, type OrchestrationContext } from "@/lib/ai/autopilot/orchestrator-core";

const lead = (over: Partial<LeadFacts> = {}): LeadFacts => ({
  status: "contacted",
  estimateAmount: 5000,
  daysSinceLastContact: 7,
  followUpCount: 0,
  unsubscribed: false,
  ...over,
});

const octx = (autonomy: Partial<AutonomyContext> = {}, over: Partial<OrchestrationContext> = {}): OrchestrationContext => ({
  autonomy: { level: "draft", ...autonomy },
  maxFollowups: 3,
  ...over,
});

describe("decideNextAction", () => {
  it("routes an unsubscribe reply to the Communication agent as an internal CRM update", () => {
    const d = decideNextAction({ kind: "inbound_email", lead: lead(), messageText: "please unsubscribe" }, octx());
    expect(d.agent).toBe("communication");
    expect(d.action).toBe("update_crm");
    expect(d.autonomy.decision).toBe("allow"); // internal at draft level
  });

  it("drafts a reply to a real inbound email and requires approval at draft level", () => {
    const d = decideNextAction({ kind: "inbound_email", lead: lead(), messageText: "How much for a full roof?" }, octx());
    expect(d.agent).toBe("communication");
    expect(d.action).toBe("draft_reply");
    expect(d.intent).toBe("medium");
    // draft_reply is internal (a draft), allowed at draft level, no approval to create it
    expect(d.requiresApproval).toBe(false);
  });

  it("new lead → Sales agent drafts a follow-up", () => {
    const d = decideNextAction({ kind: "new_lead", lead: lead({ status: "new" }) }, octx());
    expect(d.agent).toBe("sales");
    expect(d.action).toBe("draft_followup");
  });

  it("stalled deal → Sales agent follow-up", () => {
    const d = decideNextAction({ kind: "stalled_deal", lead: lead({ daysSinceLastContact: 14 }) }, octx());
    expect(d.agent).toBe("sales");
    expect(d.action).toBe("draft_followup");
  });

  it("inactive but capped → Retention agent takes no outward action", () => {
    const d = decideNextAction({ kind: "inactive_customer", lead: lead({ followUpCount: 3, daysSinceLastContact: 40 }) }, octx());
    expect(d.agent).toBe("retention");
    expect(d.action).toBe("summarize"); // read-only; no touch
    expect(d.autonomy.decision).toBe("allow");
  });

  it("inactive + eligible → Retention agent drafts a win-back", () => {
    const d = decideNextAction({ kind: "inactive_customer", lead: lead({ followUpCount: 1, daysSinceLastContact: 30 }) }, octx());
    expect(d.agent).toBe("retention");
    expect(d.action).toBe("draft_followup");
  });

  it("OFF autonomy blocks any action it routes", () => {
    const d = decideNextAction({ kind: "new_lead", lead: lead({ status: "new" }) }, octx({ level: "off" }));
    expect(d.autonomy.decision).toBe("blocked");
    expect(d.requiresApproval).toBe(true);
  });
});
