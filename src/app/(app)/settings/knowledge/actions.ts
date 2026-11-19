"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import { KNOWLEDGE_MAX_ENTRIES, validateKnowledgeInput } from "@/lib/knowledge-input";
import { createClient } from "@/lib/supabase/server";

/**
 * Owner-only CRUD for the business knowledge base. RLS (0012: bk_*_owner)
 * enforces owner-only writes in the database too; every write checks that a
 * row actually changed so a blocked write never reports success.
 */

export type KnowledgeActionResult = { error?: string; ok?: boolean };

const NOT_OWNER = "Only the business owner can change the knowledge base.";
const SAVE_FAILED = "Couldn't save that. Please try again.";

async function ownerContext() {
  const ctx = await requireBusinessContext();
  if (ctx.business.owner_id !== ctx.user.id) return null;
  return ctx;
}

function done(): KnowledgeActionResult {
  revalidatePath("/settings/knowledge");
  return { ok: true };
}

export async function addKnowledgeAction(input: {
  kind: string;
  title: string;
  content: string;
}): Promise<KnowledgeActionResult> {
  const parsed = validateKnowledgeInput(input);
  if (!parsed.ok) return { error: parsed.error };
  const ctx = await ownerContext();
  if (!ctx) return { error: NOT_OWNER };
  const supabase = await createClient();

  const { count } = await supabase
    .from("business_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.business.id);
  if ((count ?? 0) >= KNOWLEDGE_MAX_ENTRIES) {
    return { error: `You can keep up to ${KNOWLEDGE_MAX_ENTRIES} entries. Combine or delete some first.` };
  }

  const { data, error } = await supabase
    .from("business_knowledge")
    .insert({
      business_id: ctx.business.id,
      kind: parsed.value.kind,
      title: parsed.value.title,
      content: parsed.value.content,
      approved: true,
      created_by: ctx.user.id,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[knowledge] add failed", error?.message);
    return { error: SAVE_FAILED };
  }
  return done();
}

export async function updateKnowledgeAction(
  id: string,
  input: { kind: string; title: string; content: string },
): Promise<KnowledgeActionResult> {
  if (!id) return { error: "Missing entry." };
  const parsed = validateKnowledgeInput(input);
  if (!parsed.ok) return { error: parsed.error };
  const ctx = await ownerContext();
  if (!ctx) return { error: NOT_OWNER };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_knowledge")
    .update({ kind: parsed.value.kind, title: parsed.value.title, content: parsed.value.content })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) {
    console.error("[knowledge] update failed", error.message);
    return { error: SAVE_FAILED };
  }
  if (!data || data.length === 0) return { error: "That entry no longer exists." };
  return done();
}

/** Approved entries are used by the AI; unapproved ones are kept but ignored. */
export async function setKnowledgeApprovedAction(id: string, approved: boolean): Promise<KnowledgeActionResult> {
  if (!id) return { error: "Missing entry." };
  const ctx = await ownerContext();
  if (!ctx) return { error: NOT_OWNER };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_knowledge")
    .update({ approved })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) {
    console.error("[knowledge] approve toggle failed", error.message);
    return { error: SAVE_FAILED };
  }
  if (!data || data.length === 0) return { error: "That entry no longer exists." };
  return done();
}

export async function deleteKnowledgeAction(id: string): Promise<KnowledgeActionResult> {
  if (!id) return { error: "Missing entry." };
  const ctx = await ownerContext();
  if (!ctx) return { error: NOT_OWNER };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_knowledge")
    .delete()
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) {
    console.error("[knowledge] delete failed", error.message);
    return { error: SAVE_FAILED };
  }
  if (!data || data.length === 0) return { error: "That entry no longer exists." };
  return done();
}
