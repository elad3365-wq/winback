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

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export type FollowupGeneration = {
  content: string;
  model: string;
};

export async function generateFollowup(inputs: FollowupInputs): Promise<FollowupGeneration> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AiNotConfiguredError();
  }

  const client = new Anthropic({ apiKey });
  const { system, user } = buildFollowupPrompt(inputs);
  const model = resolveFollowupModel();

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    // Low effort: this is a short, well-specified writing task, so keep thinking
    // (and cost/latency) minimal.
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return { content, model: response.model ?? model };
}
