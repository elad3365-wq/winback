"use server";

import { revalidatePath } from "next/cache";

import { isAutonomyLevel } from "@/lib/ai/autopilot/autonomy";
import { setAutonomy } from "@/lib/ai/autopilot/store";
import { requireBusinessContext } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

/**
 * Owner-only controls for the AI Control Center. Autonomy level and the
 * emergency stop are the owner's call; RLS (migration 0012) also enforces
 * owner-only writes at the database.
 */

export type AutopilotActionResult = { error?: string; ok?: boolean };

export async function setAutonomyLevelAction(level: string): Promise<AutopilotActionResult> {
  if (!isAutonomyLevel(level)) return { error: "Invalid autonomy level." };
  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can change autonomy." };
  const supabase = await createClient();
  try {
    await setAutonomy(supabase, business.id, { level });
    revalidatePath("/settings/autopilot");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update autonomy." };
  }
}

export async function setEmergencyStopAction(on: boolean): Promise<AutopilotActionResult> {
  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can change this." };
  const supabase = await createClient();
  try {
    await setAutonomy(supabase, business.id, { emergencyStop: on });
    revalidatePath("/settings/autopilot");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the emergency stop." };
  }
}

/**
 * Owner authorizes (or revokes) AUTONOMOUS real sending. This is the explicit,
 * per-business opt-in required — on top of AUTOPILOT level and the environment's
 * WINBACK_GMAIL_ALLOW_SEND gate — before the AI may send a reply without review.
 */
export async function setSendAuthorizedAction(on: boolean): Promise<AutopilotActionResult> {
  const { user, business } = await requireBusinessContext();
  if (business.owner_id !== user.id) return { error: "Only the business owner can change this." };
  const supabase = await createClient();
  try {
    await setAutonomy(supabase, business.id, { sendAuthorized: on });
    revalidatePath("/settings/autopilot");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update send authorization." };
  }
}
