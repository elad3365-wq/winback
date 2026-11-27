import { describe, expect, it } from "vitest";

import { KNOWLEDGE_CONTENT_MAX, validateKnowledgeInput } from "@/lib/knowledge-input";
import { smsHref } from "@/lib/ai/manual-send";

describe("validateKnowledgeInput", () => {
  it("accepts a fact and normalises the title", () => {
    expect(validateKnowledgeInput({ kind: "fact", title: "  Gutter   cleaning ", content: " $180 " })).toEqual({
      ok: true,
      value: { kind: "fact", title: "Gutter cleaning", content: "$180" },
    });
  });

  it("stores an empty title as null", () => {
    const result = validateKnowledgeInput({ kind: "policy", title: "", content: "2-year warranty" });
    expect(result.ok && result.value.title).toBeNull();
  });

  it("rejects unknown kinds, empty and over-long content", () => {
    expect(validateKnowledgeInput({ kind: "secret", content: "x" }).ok).toBe(false);
    expect(validateKnowledgeInput({ kind: "fact", content: "   " }).ok).toBe(false);
    expect(validateKnowledgeInput({ kind: "fact", content: "x".repeat(KNOWLEDGE_CONTENT_MAX + 1) }).ok).toBe(false);
  });
});

describe("smsHref", () => {
  it("builds an sms: link with the encoded body", () => {
    expect(smsHref("(305) 555-0111", "Hi Dana & co")).toBe("sms:3055550111?&body=Hi%20Dana%20%26%20co");
    expect(smsHref("+1 305 555 0111", "x")).toBe("sms:+13055550111?&body=x");
  });

  it("returns null when there is no usable number", () => {
    expect(smsHref("n/a", "x")).toBeNull();
  });
});
