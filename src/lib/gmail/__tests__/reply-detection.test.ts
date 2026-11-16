import { describe, expect, it } from "vitest";

import {
  inboundReplyReason,
  isUnsubscribeRequest,
  leadUpdateForInboundReply,
} from "@/lib/gmail/reply-detection";

describe("isUnsubscribeRequest", () => {
  it("detects clear opt-out language", () => {
    for (const t of [
      "Please unsubscribe me",
      "I want to opt out",
      "opt-out please",
      "remove me from your list",
      "take me off this list",
      "do not contact me again",
      "don't email me",
      "no more emails please",
      "STOP",
      "stop.",
    ]) {
      expect(isUnsubscribeRequest(t)).toBe(true);
    }
  });

  it("does not fire on ordinary replies (no false positives)", () => {
    for (const t of [
      "Can you stop by next week to take a look?",
      "Thanks, that works for me!",
      "What time can you start?",
      "",
      null,
    ]) {
      expect(isUnsubscribeRequest(t)).toBe(false);
    }
  });
});

describe("leadUpdateForInboundReply", () => {
  it("unsubscribe → hard stop (unsubscribed + clear schedule)", () => {
    expect(leadUpdateForInboundReply({ unsubscribe: true })).toEqual({
      unsubscribe_status: "unsubscribed",
      next_follow_up_at: null,
    });
  });

  it("any other reply → pause autopilot + clear schedule", () => {
    expect(leadUpdateForInboundReply({ unsubscribe: false })).toEqual({
      autopilot_paused: true,
      next_follow_up_at: null,
    });
  });

  it("always clears the next scheduled follow-up", () => {
    expect(leadUpdateForInboundReply({ unsubscribe: true }).next_follow_up_at).toBeNull();
    expect(leadUpdateForInboundReply({ unsubscribe: false }).next_follow_up_at).toBeNull();
  });
});

describe("inboundReplyReason", () => {
  it("labels the audit/activity event", () => {
    expect(inboundReplyReason({ unsubscribe: true })).toBe("customer_unsubscribed");
    expect(inboundReplyReason({ unsubscribe: false })).toBe("customer_replied");
  });
});
