import { describe, expect, it } from "vitest";

import { gettingStartedSteps, showGettingStarted } from "@/lib/getting-started";

const empty = { leadCount: 0, aiDraftCount: 0, reviewedDraftCount: 0, gmailConnected: false, firstLeadId: null };

describe("getting started checklist", () => {
  it("starts a brand-new business at 'add your first lead' with the dialog link", () => {
    const steps = gettingStartedSteps(empty);
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false]);
    expect(steps[0].href).toBe("/leads?new=1");
    expect(showGettingStarted(steps)).toBe(true);
  });

  it("links the draft step to the newest lead once there is one", () => {
    const steps = gettingStartedSteps({ ...empty, leadCount: 1, firstLeadId: "abc" });
    expect(steps[0].done).toBe(true);
    expect(steps[1].href).toBe("/leads/abc");
  });

  it("hides once the required loop is done, even without Gmail", () => {
    const steps = gettingStartedSteps({ ...empty, leadCount: 3, aiDraftCount: 1, reviewedDraftCount: 1, firstLeadId: "abc" });
    expect(steps.find((s) => s.key === "gmail")?.done).toBe(false);
    expect(showGettingStarted(steps)).toBe(false);
  });
});
