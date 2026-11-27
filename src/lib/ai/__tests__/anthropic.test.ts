import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic extends actual.default {
    constructor(opts: ConstructorParameters<typeof actual.default>[0]) {
      super(opts);
      (this as unknown as { messages: unknown }).messages = { create };
    }
  }
  return { ...actual, default: MockAnthropic };
});

import Anthropic from "@anthropic-ai/sdk";

import {
  AI_FAILURE_MESSAGES,
  AiGenerationError,
  AiNotConfiguredError,
  classifyAiError,
  completeText,
} from "@/lib/ai/anthropic";

const rpc = vi.fn();
// A stand-in for the Supabase client: only .rpc is used by the budget.
const budget = {
  db: { rpc } as unknown as import("@/lib/ai/budget").AiBudget["db"],
  businessId: "b-1",
  source: "manual_followup" as const,
};

function reply(overrides: Record<string, unknown> = {}) {
  return {
    model: "claude-sonnet-5-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: "Hi Dana, just checking in." }],
    usage: { input_tokens: 400, output_tokens: 60 },
    ...overrides,
  };
}

beforeEach(() => {
  create.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) =>
    fn === "ai_reserve_call" ? { data: "usage-1", error: null } : { data: null, error: null },
  );
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.WINBACK_FOLLOWUP_MODEL;
});

describe("completeText", () => {
  it("returns text, model and usage, with headroom for adaptive thinking", async () => {
    create.mockResolvedValue(reply());
    const result = await completeText("sys", "user", budget);
    expect(result).toEqual({
      content: "Hi Dana, just checking in.",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 400, outputTokens: 60 },
    });
    const params = create.mock.calls[0][0];
    expect(params.max_tokens).toBe(4096);
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config).toEqual({ effort: "low" });
  });

  it("never returns a refused, cut-off or empty response as a draft", async () => {
    create.mockResolvedValueOnce(reply({ stop_reason: "refusal", content: [] }));
    await expect(completeText("s", "u", budget)).rejects.toMatchObject({ reason: "refusal" });
    create.mockResolvedValueOnce(reply({ stop_reason: "max_tokens" }));
    await expect(completeText("s", "u", budget)).rejects.toMatchObject({ reason: "truncated" });
    create.mockResolvedValueOnce(reply({ content: [{ type: "text", text: "   " }] }));
    await expect(completeText("s", "u", budget)).rejects.toMatchObject({ reason: "empty" });
  });

  it("throws AiNotConfiguredError without a key and makes no call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(completeText("s", "u", budget)).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("completeText budget", () => {
  it("reserves before calling and records real usage after", async () => {
    create.mockResolvedValue(reply());
    await completeText("s", "u", budget);
    expect(rpc.mock.calls[0]).toEqual([
      "ai_reserve_call",
      { p_business_id: "b-1", p_source: "manual_followup", p_model: "claude-sonnet-5-5" },
    ]);
    expect(rpc.mock.calls[1]).toEqual([
      "ai_finish_call",
      { p_id: "usage-1", p_input_tokens: 400, p_output_tokens: 60, p_ok: true },
    ]);
  });

  it("makes no model call when the database refuses the budget", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "AI_BUDGET:business_daily" } });
    await expect(completeText("s", "u", budget)).rejects.toMatchObject({ reason: "business_daily" });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed when the ledger is unreachable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function ai_reserve_call does not exist" } });
    await expect(completeText("s", "u", budget)).rejects.toMatchObject({ reason: "unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("still counts a call that failed at the provider", async () => {
    create.mockRejectedValueOnce(new Error("network"));
    await expect(completeText("s", "u", budget)).rejects.toThrow("network");
    expect(rpc.mock.calls[1][0]).toBe("ai_finish_call");
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_ok: false });
  });
});

describe("classifyAiError", () => {
  const headers = new Headers();
  it("maps SDK and local errors to owner-safe kinds", () => {
    expect(classifyAiError(new AiNotConfiguredError())).toBe("not_configured");
    expect(classifyAiError(new AiGenerationError("refusal"))).toBe("refusal");
    expect(classifyAiError(new Anthropic.RateLimitError(429, {}, "rate", headers))).toBe("rate_limited");
    expect(classifyAiError(new Anthropic.AuthenticationError(401, {}, "auth", headers))).toBe("auth");
    expect(classifyAiError(new Anthropic.NotFoundError(404, {}, "model", headers))).toBe("bad_request");
    expect(classifyAiError(new Error("socket hang up"))).toBe("unavailable");
  });

  it("has a friendly message for every kind, none leaking provider details", () => {
    for (const message of Object.values(AI_FAILURE_MESSAGES)) {
      expect(message).not.toMatch(/stack|undefined|error:/i);
    }
  });
});
