import { NextResponse } from "next/server";
import { runPurgeExpired } from "@/lib/retention/purge";

/**
 * Tech spec §11's daily `purge_expired`, hit by Vercel Cron (see
 * vercel.json). Guarded by the same shared secret as the job runner.
 *
 * **Dry run unless explicitly told otherwise.** `?commit=1` is what
 * actually deletes; a bare GET reports what *would* go. That asymmetry
 * is deliberate for the one operation in this product that cannot be
 * undone: a misconfigured schedule, a copied URL or a curious poke at
 * the endpoint costs a JSON report rather than every CV Ziphyre holds.
 * The cron entry carries the flag; nothing else has to.
 *
 * The report is returned and logged either way, because §11 requires
 * this job to be logged — a purge nobody can account for afterwards is
 * indistinguishable from data loss.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commit = new URL(request.url).searchParams.get("commit") === "1";
  const report = await runPurgeExpired({ dryRun: !commit });

  console.log(
    `[purge] ${report.dryRun ? "DRY RUN" : "COMMITTED"} — ` +
      `${report.purged.length} posting(s), ` +
      `${report.purged.reduce((n, p) => n + p.applications, 0)} application(s), ` +
      `${report.warned.length} warned, ${report.errors.length} error(s)`,
    JSON.stringify(report),
  );

  return NextResponse.json(report, {
    status: report.errors.length > 0 ? 500 : 200,
  });
}
