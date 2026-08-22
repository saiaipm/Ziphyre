import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobKind, JobPayload } from "@/lib/jobs/types";

/**
 * The `job` table carries no client policy at all (tech spec §3
 * exceptions table) — the admin client is required here even though
 * the caller may be an ordinary request (e.g. the manual-upload
 * action), not just a background context. That's the table's own RLS
 * forcing this, not a general exception to "elevated client only for
 * bootstrap and jobs."
 */
export async function enqueueJob<K extends JobKind>(
  organizationId: string,
  kind: K,
  payload: JobPayload<K>,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("job").insert({
    organization_id: organizationId,
    kind,
    payload,
  });
  if (error) throw error;
}
