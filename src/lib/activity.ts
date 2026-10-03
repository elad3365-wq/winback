import "server-only";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Appends a row to lead_activity. Runs through the user's RLS-scoped server
 * client, so it can only ever write activity for a business the caller belongs
 * to. Best-effort: a logging failure never blocks the primary action.
 */
export async function logActivity(input: {
  businessId: string;
  leadId: string;
  userId: string | null;
  type: string;
  metadata?: Json;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("lead_activity").insert({
      business_id: input.businessId,
      lead_id: input.leadId,
      type: input.type,
      metadata: input.metadata ?? null,
      created_by: input.userId,
    });
  } catch {
    // Timeline logging is non-critical — never surface as a user-facing error.
  }
}
