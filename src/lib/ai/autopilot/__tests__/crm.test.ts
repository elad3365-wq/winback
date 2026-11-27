import { describe, expect, it } from "vitest";

import { crmUpdateForInbound } from "@/lib/ai/autopilot/crm";

describe("crmUpdateForInbound", () => {
  it("always pauses the follow-up sequence on a reply", () => {
    expect(crmUpdateForInbound({ intent: "low", currentStatus: "new" }).next_follow_up_at).toBeNull();
    expect(crmUpdateForInbound({ intent: "high", currentStatus: "contacted" }).next_follow_up_at).toBeNull();
  });

  it("advances to interested on high intent", () => {
    expect(crmUpdateForInbound({ intent: "high", currentStatus: "contacted" }).status).toBe("interested");
    expect(crmUpdateForInbound({ intent: "high", currentStatus: "new" }).status).toBe("interested");
  });

  it("moves a brand-new lead to contacted on medium/low intent", () => {
    expect(crmUpdateForInbound({ intent: "medium", currentStatus: "new" }).status).toBe("contacted");
    expect(crmUpdateForInbound({ intent: "low", currentStatus: "new" }).status).toBe("contacted");
  });

  it("does not change an already-progressed stage on medium/low", () => {
    expect(crmUpdateForInbound({ intent: "medium", currentStatus: "followup_2" }).status).toBeUndefined();
  });

  it("never overwrites a locked status", () => {
    for (const s of ["recovered", "lost", "unsubscribed", "interested", "call_requested", "paused"] as const) {
      expect(crmUpdateForInbound({ intent: "high", currentStatus: s }).status).toBeUndefined();
    }
  });
});
