"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { disconnect } from "@/lib/google/auth";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * FR-2. Removes the stored refresh token. Existing candidates and their CVs
 * are untouched — those live in our own Storage, which is exactly why FR-4
 * can promise they stay readable (TechDecisions §5.3).
 */
export async function disconnectGoogle(): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    await disconnect(session.organization.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath("/settings/connections");
  revalidatePath("/postings");
  return { ok: true, data: undefined };
}
