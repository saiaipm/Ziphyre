import { NextResponse } from "next/server";
import { runQueuedJobs } from "@/lib/jobs/runner";

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
