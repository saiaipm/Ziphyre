import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * Tech spec §5.3: one import job per open, form-connected posting, every
 * minute. This route only enqueues — /api/cron/jobs drains the queue, so
 * imports share the same claim, backoff and retry machinery as screening.
 *
 * Guarded by CRON_SECRET. /api/cron is deliberately outside the auth
 * middleware's session gate (see middleware.ts) — cron carries no session.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: postings, error } = await admin
    .from("posting")
    .select("id, organization_id")
    .eq("status", "open")
    .not("spreadsheet_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Skip postings that already have an import queued or running, so a slow
  // sheet read can't pile up a minute's worth of duplicate work behind it.
  const { data: inFlight } = await admin
    .from("job")
    .select("payload")
    .eq("kind", "import_submissions")
    .in("status", ["queued", "running"]);

  const busy = new Set(
    (inFlight ?? []).map((j) => (j.payload as { postingId?: string })?.postingId),
  );

  let queued = 0;
  for (const posting of postings ?? []) {
    if (busy.has(posting.id)) continue;
    await enqueueJob(posting.organization_id, "import_submissions", {
      postingId: posting.id,
    });
    queued++;
  }

  return NextResponse.json({ queued });
}
