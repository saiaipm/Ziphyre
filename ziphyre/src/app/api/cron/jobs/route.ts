import { NextResponse } from "next/server";
import { runQueuedJobs } from "@/lib/jobs/runner";

/**
 * Screening is a storage fetch, a PDF parse and a model call, pumped by
 * `after()` from this route's Server Actions. Vercel's default cap is
 * 10 seconds, which killed the function mid-job and left the row
 * `running` with nothing logged — a timeout is not an error, so it
 * appears as a job that simply never finishes.
 *
 * 60s is the Hobby ceiling. It is a cap, not a target: the work still
 * needs to move to a queue that survives a request, which §10 already
 * says about `build_export` and applies here too.
 */
export const maxDuration = 60;


/**
 * Tech spec §7/§8: the real production trigger, hit by Vercel Cron
 * every minute (see vercel.json). Guarded by a shared secret so it
 * can't be invoked by anyone who finds the URL.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runQueuedJobs({ limit: 10 });
  return NextResponse.json(result);
}
