import { describe, expect, it } from "vitest";

import {
  decideAutoSend,
  isAutomatedSender,
  isSensitiveInbound,
  replyDefersToHuman,
  type AutoSendInputs,
} from "@/lib/gmail/autosend";

function ok(overrides: Partial<AutoSendInputs> = {}): AutoSendInputs {
  return {
    globalSendEnabled: true,
    autopilot: true,
    ownerAuthorizedSending: true,
    emergencyStop: false,
    recipientUnsubscribed: false,
    automatedSender: false,
    sensitive: false,
    draftValid: true,
    defersToHuman: false,
    ...overrides,
  };
}

describe("isSensitiveInbound", () => {
  it("flags refunds, legal, complaints, disputes", () => {
    expect(isSensitiveInbound("I want a refund now")).toBe(true);
    expect(isSensitiveInbound("my lawyer will contact you")).toBe(true);
    expect(isSensitiveInbound("this is a formal complaint")).toBe(true);
    expect(isSensitiveInbound("I will dispute the charge")).toBe(true);
    expect(isSensitiveInbound("please cancel my appointment")).toBe(true);
  });
  it("leaves ordinary questions alone", () => {
    expect(isSensitiveInbound("Can you come next Tuesday?")).toBe(false);
    expect(isSensitiveInbound("")).toBe(false);
  });
});

describe("isAutomatedSender", () => {
  it("catches no-reply / daemon / list senders and empty addresses", () => {
    expect(isAutomatedSender("no-reply@example.com")).toBe(true);
    expect(isAutomatedSender("noreply@example.com")).toBe(true);
    expect(isAutomatedSender("mailer-daemon@mail.example.com")).toBe(true);
    expect(isAutomatedSender("notifications@example.com")).toBe(true);
    expect(isAutomatedSender(null)).toBe(true);
    expect(isAutomatedSender("")).toBe(true);
  });
  it("allows a real person", () => {
    expect(isAutomatedSender("dana@gmail.com")).toBe(false);
  });
});

describe("replyDefersToHuman", () => {
  it("detects the drafter's punt phrases", () => {
    expect(replyDefersToHuman("Thanks! A team member will follow up with the specifics.")).toBe(true);
    expect(replyDefersToHuman("We'll get back to you with the exact pricing.")).toBe(true);
    expect(replyDefersToHuman("")).toBe(true);
  });
  it("passes a real answer", () => {
    expect(replyDefersToHuman("Yes, we can start Tuesday at 9am. See you then!")).toBe(false);
  });
});

describe("decideAutoSend", () => {
  it("sends only when every gate is satisfied", () => {
    expect(decideAutoSend(ok())).toEqual({ send: true, reason: "authorized_autopilot_send" });
  });
  it("never sends while the environment gate is off (pilot default)", () => {
    expect(decideAutoSend(ok({ globalSendEnabled: false })).send).toBe(false);
  });
  it("never sends below autopilot or without owner authorization", () => {
    expect(decideAutoSend(ok({ autopilot: false })).send).toBe(false);
    expect(decideAutoSend(ok({ ownerAuthorizedSending: false })).send).toBe(false);
  });
  it("respects emergency stop and unsubscribe", () => {
    expect(decideAutoSend(ok({ emergencyStop: true })).send).toBe(false);
    expect(decideAutoSend(ok({ recipientUnsubscribed: true })).send).toBe(false);
  });
  it("routes automated senders, sensitive topics, invalid or deferring drafts to a human", () => {
    expect(decideAutoSend(ok({ automatedSender: true })).send).toBe(false);
    expect(decideAutoSend(ok({ sensitive: true })).reason).toBe("sensitive_topic_routed_to_human");
    expect(decideAutoSend(ok({ draftValid: false })).send).toBe(false);
    expect(decideAutoSend(ok({ defersToHuman: true })).reason).toBe("draft_defers_to_human");
  });
});
