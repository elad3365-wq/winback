/**
 * First-run checklist shown on the dashboard until a new business has done the
 * core beta loop once: add a lead → draft an AI follow-up → review it.
 * Pure, so it can be unit tested.
 */

export type GettingStartedInput = {
  leadCount: number;
  aiDraftCount: number;
  /** Drafts the owner approved, copied or marked as sent. */
  reviewedDraftCount: number;
  gmailConnected: boolean;
  /** Id of the newest lead, so "draft a follow-up" can link straight to it. */
  firstLeadId: string | null;
};

export type GettingStartedStep = {
  key: "lead" | "draft" | "review" | "gmail";
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  optional: boolean;
};

export function gettingStartedSteps(input: GettingStartedInput): GettingStartedStep[] {
  const leadHref = input.firstLeadId ? `/leads/${input.firstLeadId}` : "/leads?new=1";
  return [
    {
      key: "lead",
      title: "Add your first lead",
      description:
        "A customer who got an estimate and went quiet. Name, phone, the service and the amount are enough.",
      href: "/leads?new=1",
      cta: "Add a lead",
      done: input.leadCount > 0,
      optional: false,
    },
    {
      key: "draft",
      title: "Draft an AI follow-up",
      description:
        "Open the lead and press “Generate AI Follow-up”. WinBack writes it from your business profile — nothing is sent.",
      href: leadHref,
      cta: "Open the lead",
      done: input.aiDraftCount > 0,
      optional: false,
    },
    {
      key: "review",
      title: "Review and approve it",
      description: "Edit the draft if you like, then approve it and copy it into SMS or email yourself.",
      href: leadHref,
      cta: "Review the draft",
      done: input.reviewedDraftCount > 0,
      optional: false,
    },
    {
      key: "gmail",
      title: "Connect Gmail (optional)",
      description: "Lets WinBack match customer replies to leads. Messages still need your approval.",
      href: "/settings/email",
      cta: "Email settings",
      done: input.gmailConnected,
      optional: true,
    },
  ];
}

/** The checklist hides once every required step is done. */
export function showGettingStarted(steps: GettingStartedStep[]): boolean {
  return steps.some((step) => !step.optional && !step.done);
}
