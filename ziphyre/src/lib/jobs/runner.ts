import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runScreenApplication,
  markScreeningNeedsManualReview,
} from "@/lib/jobs/handlers/screen-application";
import { deliverMessage, markMessageFailed } from "@/lib/mail/send";
import type {
  JobKind,
  JobRow,
  ScreenApplicationPayload,
  SendMessagePayload,
} from "@/lib/jobs/types";

/** Tech spec §7: 1m, 5m, 15m, 1h, 6h — indexed by attempt number (1-based). */
const BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];
const STUCK_JOB_MINUTES = 10;

/**
 * Stop *claiming* work once this much of the invocation is gone.
 *
 * A serverless function is killed at its duration limit with no error
 * and no chance to tidy up, so a job claimed at second 59 is a job that
 * will be marked `running` and then abandoned — and, until the stale
 * reclaim runs, invisible. That happened for real: two screenings shared
 * one 60s invocation, the first finished, the second was claimed with
 * seconds left and left `in_progress` with a score already written.
 *
 * A deadline rather than a job count, because the right number depends
 * entirely on what the jobs are: ten `send_message` jobs fit easily,
 * two screenings against a slow provider do not. This never *interrupts*
 * a running job — it only declines to start another one — so the work
 * left behind stays cleanly `queued` for the next invocation.
 *
 * 45s against Vercel's 60s cap leaves room for the job in flight to
 * finish and for the row to be updated afterwards.
 */
const CLAIM_DEADLINE_MS = 45_000;

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
    case "send_message":
      await deliverMessage(
        job.organization_id,
        (job.payload as SendMessagePayload).messageId,
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
  // FR-111: a message that ran out of retries is marked failed against
  // the candidate it was meant for, never left looking queued forever.
  if (job.kind === "send_message") {
    const payload = job.payload as SendMessagePayload;
    await markMessageFailed(
      job.organization_id,
      payload.messageId,
      `Couldn't send after several attempts: ${message}`,
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
  const kinds = options?.kinds ?? (["screen_application"] as JobKind[]);
  const limit = options?.limit ?? 10;
  const workerId = randomUUID();
  const startedAt = Date.now();

  await reclaimStuckJobs();

  const admin = createAdminClient();
  let processed = 0;

  for (let i = 0; i < limit; i++) {
    if (Date.now() - startedAt > CLAIM_DEADLINE_MS) {
      console.log(
        `[jobs] stopping after ${processed} — ${Math.round((Date.now() - startedAt) / 1000)}s used, leaving the rest queued`,
      );
      break;
    }
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

      if (job.attempts >= job.max_attempts) {
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
