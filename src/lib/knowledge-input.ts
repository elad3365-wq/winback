/**
 * Validation for business knowledge-base entries (the verified facts the AI may
 * cite: services, prices, hours, policies). Pure so it is unit-tested and
 * shared by the server actions.
 */

export const KNOWLEDGE_KINDS = ["fact", "faq", "policy", "instruction"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  fact: "Service / price / fact",
  faq: "Common question",
  policy: "Policy (warranty, cancellation…)",
  instruction: "Instruction for the AI",
};

/** Matches the per-entry cap used when building the prompt (lib/ai/followup.ts). */
export const KNOWLEDGE_TITLE_MAX = 120;
export const KNOWLEDGE_CONTENT_MAX = 600;
/** The prompt uses at most 25 entries; refuse more so nothing is silently ignored. */
export const KNOWLEDGE_MAX_ENTRIES = 25;

export type KnowledgeInput = { kind: KnowledgeKind; title: string | null; content: string };

export function isKnowledgeKind(value: unknown): value is KnowledgeKind {
  return typeof value === "string" && (KNOWLEDGE_KINDS as readonly string[]).includes(value);
}

export function validateKnowledgeInput(raw: {
  kind?: unknown;
  title?: unknown;
  content?: unknown;
}): { ok: true; value: KnowledgeInput } | { ok: false; error: string } {
  const kind = isKnowledgeKind(raw.kind) ? raw.kind : null;
  if (!kind) return { ok: false, error: "Choose what kind of entry this is." };

  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim() : "";
  if (title.length > KNOWLEDGE_TITLE_MAX) {
    return { ok: false, error: `Keep the title under ${KNOWLEDGE_TITLE_MAX} characters.` };
  }

  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) return { ok: false, error: "Write the fact the AI may use." };
  if (content.length > KNOWLEDGE_CONTENT_MAX) {
    return { ok: false, error: `Keep each entry under ${KNOWLEDGE_CONTENT_MAX} characters — split it into two.` };
  }

  return { ok: true, value: { kind, title: title || null, content } };
}
