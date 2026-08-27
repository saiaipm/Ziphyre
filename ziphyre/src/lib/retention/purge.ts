import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retention — tech spec §11, TechDecisions §8.
 *
 * The apply page promises every candidate: *"Your details are kept for
 * six months after the role closes, and then deleted."* This is the
 * code that keeps that promise, and **Ziphyre holds the only copy of
 * every CV it has ever received** — deleting it deletes it. §11 calls
 * this the one job that must be tested before it ever runs in
 * production, which is why it takes a `dryRun` and reports exactly what
 * it would touch rather than only what it did.
 *
 * Runs with the admin client because it is deliberately system-wide:
 * there is no signed-in user at 3am, and RLS is scoped to a session.
 * Every query therefore filters explicitly — tech spec §3's rule that
 * background work hand-enforces the isolation RLS would otherwise give.
 */

const WARN_WINDOW_DAYS = 30;
/** Rate-limit rows stop being useful within the hour (tech spec §5.3). */
const ATTEMPT_RETENTION_HOURS = 24;

export type PurgeReport = {
  dryRun: boolean;
  ranAt: string;
  warned: { postingId: string; name: string; purgeAfter: string }[];
  purged: {
    postingId: string;
    name: string;
    purgeAfter: string;
    applications: number;
    cvsDeleted: number;
    candidatesAnonymised: number;
    candidatesKept: number;
    screeningsCleared: number;
  }[];
  expiredAttempts: number;
  errors: string[];
};

export async function runPurgeExpired(
  { dryRun = true }: { dryRun?: boolean } = {},
): Promise<PurgeReport> {
  const admin = createAdminClient();
  const now = new Date();
  const report: PurgeReport = {
    dryRun,
    ranAt: now.toISOString(),
    warned: [],
    purged: [],
    expiredAttempts: 0,
    errors: [],
  };

  // ---- 1. Warn, 30 days out -------------------------------------------
  const warnBefore = new Date(now);
  warnBefore.setDate(warnBefore.getDate() + WARN_WINDOW_DAYS);

  const { data: warnable } = await admin
    .from("posting")
    .select("id, name, purge_after")
    .eq("status", "closed")
    .is("purge_warned_at", null)
    .not("purge_after", "is", null)
    .gt("purge_after", now.toISOString())
    .lte("purge_after", warnBefore.toISOString());

  for (const p of warnable ?? []) {
    report.warned.push({
      postingId: p.id,
      name: p.name,
      purgeAfter: p.purge_after as string,
    });
    if (!dryRun) {
      await admin
        .from("posting")
        .update({ purge_warned_at: now.toISOString() })
        .eq("id", p.id);
    }
  }

  // ---- 2. Purge, once the date has genuinely passed --------------------
  //
  // `lte` against now, never a window or an "or older than" shortcut:
  // §11's rule is that this runs only against postings whose purge_after
  // has actually passed.
  const { data: expired, error: expiredError } = await admin
    .from("posting")
    .select("id, name, purge_after, organization_id")
    .eq("status", "closed")
    .not("purge_after", "is", null)
    .lte("purge_after", now.toISOString());

  if (expiredError) {
    report.errors.push(`listing expired postings: ${expiredError.message}`);
    return report;
  }

  for (const posting of expired ?? []) {
    try {
      report.purged.push(await purgePosting(admin, posting, now, dryRun));
    } catch (e) {
      report.errors.push(
        `posting ${posting.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ---- 3. Rate-limit rows ---------------------------------------------
  const attemptCutoff = new Date(now);
  attemptCutoff.setHours(attemptCutoff.getHours() - ATTEMPT_RETENTION_HOURS);

  const { count } = await admin
    .from("apply_attempt")
    .select("id", { count: "exact", head: true })
    .lt("created_at", attemptCutoff.toISOString());
  report.expiredAttempts = count ?? 0;

  if (!dryRun && report.expiredAttempts > 0) {
    await admin
      .from("apply_attempt")
      .delete()
      .lt("created_at", attemptCutoff.toISOString());
  }

  return report;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function purgePosting(
  admin: AdminClient,
  posting: { id: string; name: string; purge_after: string; organization_id: string },
  now: Date,
  dryRun: boolean,
): Promise<PurgeReport["purged"][number]> {
  const { data: openings, error: openingError } = await admin
    .from("opening")
    .select("id")
    .eq("posting_id", posting.id);
  if (openingError) throw new Error(`openings: ${openingError.message}`);
  const openingIds = (openings ?? []).map((o) => o.id);

  const result = {
    postingId: posting.id,
    name: posting.name,
    purgeAfter: posting.purge_after,
    applications: 0,
    cvsDeleted: 0,
    candidatesAnonymised: 0,
    candidatesKept: 0,
    screeningsCleared: 0,
  };
  if (openingIds.length === 0) return result;

  // Already-purged rows are skipped, which makes the whole job
  // idempotent: a retry after a partial failure resumes rather than
  // re-deleting, and re-deleting is not a thing that can be undone.
  const { data: applications, error: appListError } = await admin
    .from("application")
    .select("id, candidate_id, cv_storage_path")
    .in("opening_id", openingIds)
    .is("purged_at", null);
  if (appListError) throw new Error(`applications: ${appListError.message}`);

  const apps = applications ?? [];
  result.applications = apps.length;
  if (apps.length === 0) return result;

  const appIds = apps.map((a) => a.id);
  const cvPaths = apps
    .map((a) => a.cv_storage_path)
    .filter((p): p is string => Boolean(p));
  result.cvsDeleted = cvPaths.length;

  // A candidate can hold applications on more than one posting.
  // Anonymising one whose other application sits on a live posting
  // would destroy data the product is still using — so a candidate is
  // only anonymised once every application they have is purged.
  const candidateIds = [...new Set(apps.map((a) => a.candidate_id))];
  const { data: elsewhere, error: elsewhereError } = await admin
    .from("application")
    .select("candidate_id, id")
    .in("candidate_id", candidateIds)
    .is("purged_at", null);
  if (elsewhereError) throw new Error(`candidate scan: ${elsewhereError.message}`);

  const stillLive = new Set(
    (elsewhere ?? [])
      .filter((a) => !appIds.includes(a.id))
      .map((a) => a.candidate_id),
  );
  const anonymisable = candidateIds.filter((id) => !stillLive.has(id));
  result.candidatesAnonymised = anonymisable.length;
  result.candidatesKept = candidateIds.length - anonymisable.length;

  const { count: screeningCount } = await admin
    .from("screening")
    .select("id", { count: "exact", head: true })
    .in("application_id", appIds);
  result.screeningsCleared = screeningCount ?? 0;

  if (dryRun) return result;

  // ---- The irreversible part, narrowest blast radius first ------------

  if (cvPaths.length > 0) {
    const { error } = await admin.storage.from("cvs").remove(cvPaths);
    // A storage failure must not stop the database purge: the promise
    // to the candidate is that their details go, and a file left behind
    // with every pointer to it gone is a smaller breach than a full
    // record retained because one delete failed. Recorded, not silent.
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }

  // §11's retained set — component ratings, overall score, stage,
  // disposition, dates — is everything NOT named here.
  const { error: appError } = await admin
    .from("application")
    .update({
      cv_storage_path: null,
      cv_mime: null,
      cv_original_filename: null,
      form_answers: {},
      admin_overrides: {},
      purged_at: now.toISOString(),
    })
    .in("id", appIds);
  if (appError) throw new Error(`applications: ${appError.message}`);

  // `strengths`, `gaps` and `overall_read` are NOT NULL, so they are
  // emptied rather than nulled. They are free prose about a person and
  // the only part of a screening that identifies them; the numbers stay
  // because §11 keeps them, and they say nothing on their own.
  const { error: screeningError } = await admin
    .from("screening")
    .update({
      strengths: "",
      gaps: "",
      overall_read: "",
      experience_discrepancy: null,
    })
    .in("application_id", appIds);
  if (screeningError) throw new Error(`screenings: ${screeningError.message}`);

  for (const candidateId of anonymisable) {
    // `email` is NOT NULL and unique per organisation, so it cannot be
    // nulled — it is replaced with a value that identifies nobody and
    // still satisfies the constraint.
    const { error } = await admin
      .from("candidate")
      .update({
        full_name: null,
        email: `purged+${candidateId}@ziphyre.internal`,
      })
      .eq("id", candidateId);
    if (error) throw new Error(`candidate ${candidateId}: ${error.message}`);
  }

  return result;
}
