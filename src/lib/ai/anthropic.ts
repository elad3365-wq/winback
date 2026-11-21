import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { buildFollowupPrompt, type FollowupInputs } from "@/lib/ai/followup";
import { resolveFollowupModel } from "@/lib/ai/models";

/**
 * Server-only wrapper around the Anthropic API. The key is read from a
 * server-only environment variable and never reaches the browser: this module
 * imports "server-only", so any accidental client import fails the build.
 *
 * The model is resolved per call from WINBACK_FOLLOWUP_MODEL (see
 * `lib/ai/models.ts`) with a cost-efficient default — short, human-reviewed
 * follow-ups don't need the most expensive model.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI provider is not configured.");
    this.name = "AiNotConfiguredError";
  }
}

/**
 * The provider answered but the result is not a usable draft (refused, cut off
 * at the token limit, or empty). Never save a partial message as a draft.
 */
export class AiGenerationError extends Error {
  constructor(public readonly reason: "refusal" | "truncated" | "empty") {
    super(`AI generation failed: ${reason}`);
    this.name = "AiGenerationError";
  }
}

export type AiFailureKind =
  | "not_configured"
  | "rate_limited"
  | "auth"
  | "bad_request"
  | "refusal"
  | "truncated"
  | "empty"
  | "unavailable";

/** Classify any error thrown by completeText() for logging and owner-facing copy. */
export function classifyAiError(error: unknown): AiFailureKind {
  if (error instanceof AiNotConfiguredError) return "not_configured";
  if (error instanceof AiGenerationError) return error.reason;
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "auth";
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return "bad_request";
  }
  return "unavailable";
}

/** Owner-facing message for each failure kind (no provider internals leak). */
export const AI_FAILURE_MESSAGES: Record<AiFailureKind, string> = {
  not_configured:
    "AI is not configured yet for this workspace. You can still write the message yourself; ask the WinBack team to turn AI on.",
  rate_limited: "The AI service is busy right now. Wait a minute and try again.",
  auth: "The AI service rejected this deployment's API key. Ask the WinBack admin to check it.",
  bad_request: "The AI model configuration is invalid. Ask the WinBack team to check the AI model setting.",
  refusal: "The AI declined to write this message. Try again, or write it yourself.",
  truncated: "The AI response was cut off. Please try again.",
  empty: "Couldn't generate a usable message. Please try again.",
  unavailable: "The AI service is unavailable right now. Please try again.",
};

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export type FollowupGeneration = {
  content: string;
  model: string;
  /** Token usage reported by the provider (for spend logging). */
  usage?: { inputTokens: number; outputTokens: number };
};

/**
 * Low-level helper: run one short writing task against the configured model and
 * return the text + the model id actually used. Shared by the follow-up drafter
 * and the Gmail reply drafter so the model choice, effort, and client setup stay
 * in one place. Throws AiNotConfiguredError when no key is present.
 */
export async function completeText(
  system: string,
  user: string,
  // Current models think adaptively by default and thinking tokens count toward
  // max_tokens, so leave headroom: a 1,024 cap could cut a short draft mid-
  // sentence. Billing is per token actually used, not per cap.
  maxTokens = 4096,
): Promise<FollowupGeneration> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }

  const client = new Anthropic({ apiKey });
  const model = resolveFollowupModel();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // Low effort: short, well-specified writing task — keep thinking/cost/latency minimal.
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });

  // A refusal or a cut-off response must never become a draft.
  if (response.stop_reason === "refusal") throw new AiGenerationError("refusal");
  if (response.stop_reason === "max_tokens") throw new AiGenerationError("truncated");

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!content) throw new AiGenerationError("empty");

  return {
    content,
    model: response.model ?? model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}

export async function generateFollowup(inputs: FollowupInputs): Promise<FollowupGeneration> {
  const { system, user } = buildFollowupPrompt(inputs);
  return completeText(system, user);
}
