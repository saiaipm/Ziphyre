import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runScreenApplication,
  markScreeningNeedsManualReview,
} from "@/lib/jobs/handlers/screen-application";
import { runImportSubmissions } from "@/lib/jobs/handlers/import-submissions";
import { GoogleNeedsReconnectError } from "@/lib/google/auth";
import type {
  JobKind,
  JobRow,
  ScreenApplicationPayload,
  ImportSubmissionsPayload,
} from "@/lib/jobs/types";

/** Tech spec §7: 1m, 5m, 15m, 1h, 6h — indexed by attempt number (1-based). */
const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];
const STUCK_JOB_MINUTES = 10;

async function reclaimStuckJobs(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_JOB_MINUTES * 60_000).toISOString();
  await admin
    .from("job")
    .update({ status: "queued", locked_at: null, locked_by: null })
    .eq("status", "running")
    .lt("locked_at", cutoff);
}

async function dispatch(job: JobRow): Promise<void> {
  switch (job.kind as JobKind) {
    case "screen_application":
      await runScreenApplication(
        job.organization_id,
        job.payload as ScreenApplicationPayload,
      );
      return;
    case "import_submissions":
      await runImportSubmissions(
        job.organization_id,
        job.payload as ImportSubmissionsPayload,
      );
      return;
    default:
      throw new Error(`unknown job kind: ${job.kind}`);
  }
}

/** Terminal failure per job kind (tech spec §7's failure table). */
async function handleTerminalFailure(job: JobRow, message: string): Promise<void> {
  if (job.kind === "screen_application") {
    const payload = job.payload as ScreenApplicationPayload;
    await markScreeningNeedsManualReview(
      job.organization_id,
      payload.applicationId,
      `Screening couldn't complete after several attempts: ${message}`,
    );
  }
}

/**
 * Claims and runs queued jobs one at a time, via `claim_next_job`'s
 * atomic `for update skip locked` (tech spec §7) — safe to call
 * concurrently (the cron route) or eagerly (the `after()` pump in the
 * upload action); a job is never claimed twice.
 */
export async function runQueuedJobs(options?: {
  kinds?: JobKind[];
  limit?: number;
}): Promise<{ processed: number }> {
  const kinds =
    options?.kinds ?? (["screen_application", "import_submissions"] as JobKind[]);
  const limit = options?.limit ?? 10;
  const workerId = randomUUID();

  await reclaimStuckJobs();

  const admin = createAdminClient();
  let processed = 0;

  for (let i = 0; i < limit; i++) {
    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_next_job",
      { p_kinds: kinds, p_worker: workerId },
    );
    if (claimError) throw claimError;

    const job = (claimed as JobRow[] | null)?.[0];
    if (!job) break;

    processed++;

    try {
      await dispatch(job);
      await admin.from("job").update({ status: "succeeded" }).eq("id", job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // A revoked or expired Google grant never recovers by retrying, and
      // the connection already carries needs_reconnect for the UI to act
      // on. Burning five backoff attempts would only delay the next real
      // import once the admin reconnects.
      const terminal = err instanceof GoogleNeedsReconnectError;

      if (terminal || job.attempts >= job.max_attempts) {
        await admin
          .from("job")
          .update({ status: "failed", last_error: message })
          .eq("id", job.id);
        await handleTerminalFailure(job, message);
      } else {
        const backoff = BACKOFF_SECONDS[job.attempts - 1] ?? BACKOFF_SECONDS.at(-1)!;
        await admin
          .from("job")
          .update({
            status: "queued",
            last_error: message,
            run_after: new Date(Date.now() + backoff * 1000).toISOString(),
          })
          .eq("id", job.id);
      }
    }
  }

  return { processed };
}
