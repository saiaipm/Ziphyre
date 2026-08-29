/**
 * One-off: retire the real candidates' pipeline.
 *
 * STATUS has carried this as "the user's own step" since M8 — seven
 * real people's CVs, kept only until deliberately retired. The sample
 * pipeline now exists to replace them for demos, and the apply flow
 * needs a pipeline at zero to be tested end to end.
 *
 * **Dry run unless told otherwise.** Reports what *would* go; only
 * `--commit` deletes. Same asymmetry `lib/retention/purge.ts` uses,
 * and for the same reason: this is the operation that cannot be
 * undone, so a misfired invocation should cost a report rather than
 * every real CV Ziphyre holds.
 *
 * What it does NOT touch: the posting, its openings, their JD versions
 * and requirements, the apply token, or anything on a posting marked
 * `is_sample`. The apply link works the moment this finishes.
 *
 * Storage is removed through `admin.storage.from("cvs").remove()` —
 * the same call `purge.ts` makes. Deleting `storage.objects` rows in
 * SQL drops the metadata and can leave the actual file behind, which
 * for real candidates' CVs is not deletion at all.
 *
 * Order matters: collect paths, remove the objects, *then* delete the
 * rows. The other way round loses the paths and orphans the files —
 * which is exactly how the two orphans this script also sweeps came
 * to exist.
 *
 *   npx tsx scripts/retire-real-cvs.ts            # dry run
 *   npx tsx scripts/retire-real-cvs.ts --commit   # actually delete
 */
import { createRequire } from "node:module";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// `server-only` throws unconditionally outside Next's bundler.
const require = createRequire(import.meta.url);
const resolved = require.resolve("server-only");
require.cache[resolved] = {
  id: resolved,
  filename: resolved,
  loaded: true,
  exports: {},
} as NodeJS.Module;

const COMMIT = process.argv.includes("--commit");

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const admin = createAdminClient();

  console.log(COMMIT ? "MODE: COMMIT — this deletes.\n" : "MODE: dry run — nothing is deleted.\n");

  // --- 1. The target set: applications on non-sample postings ----------
  const { data: postings, error: pErr } = await admin
    .from("posting")
    .select("id, name, is_sample");
  if (pErr) throw new Error(`posting read failed: ${pErr.message}`);

  const realPostingIds = (postings ?? []).filter((p) => !p.is_sample).map((p) => p.id);
  const samplePostingIds = (postings ?? []).filter((p) => p.is_sample).map((p) => p.id);

  const { data: openings, error: oErr } = await admin
    .from("opening")
    .select("id, title, posting_id");
  if (oErr) throw new Error(`opening read failed: ${oErr.message}`);

  const realOpeningIds = (openings ?? [])
    .filter((o) => realPostingIds.includes(o.posting_id))
    .map((o) => o.id);

  const { data: apps, error: aErr } = await admin
    .from("application")
    .select("id, candidate_id, cv_storage_path, cv_original_filename, source, current_stage")
    .in("opening_id", realOpeningIds);
  if (aErr) throw new Error(`application read failed: ${aErr.message}`);

  const applications = apps ?? [];
  const applicationIds = applications.map((a) => a.id);
  const candidateIds = [...new Set(applications.map((a) => a.candidate_id))];

  // --- 2. Everything that will go with them ---------------------------
  const counts = {
    screenings: await countIn(admin, "screening", "application_id", applicationIds),
    stageEvents: await countIn(admin, "stage_event", "application_id", applicationIds),
    messages: await countIn(admin, "message", "application_id", applicationIds),
  };

  // --- 3. Storage: the target CVs, plus anything already orphaned -----
  const targetPaths = applications
    .map((a) => a.cv_storage_path)
    .filter((p): p is string => Boolean(p));

  const { data: allApps, error: allErr } = await admin.from("application").select("id");
  if (allErr) throw new Error(`application id read failed: ${allErr.message}`);
  const liveAppIds = new Set((allApps ?? []).map((a) => a.id));

  const orphanPaths = await findOrphanedObjects(admin, liveAppIds);

  // --- 4. Report ------------------------------------------------------
  console.log(`Postings kept (sample):      ${samplePostingIds.length}`);
  console.log(`Postings kept (real, empty): ${realPostingIds.length}`);
  console.log(`Openings kept:               ${realOpeningIds.length}\n`);

  console.log(`Applications to delete:      ${applications.length}`);
  for (const a of applications) {
    console.log(`  - ${a.cv_original_filename ?? "(no file)"}  [${a.source}, ${a.current_stage}]`);
  }
  console.log(`\nCascades with them:`);
  console.log(`  screenings:   ${counts.screenings}`);
  console.log(`  stage_events: ${counts.stageEvents}`);
  console.log(`  messages:     ${counts.messages}   <- the whole outbox`);
  console.log(`Candidates to delete:        ${candidateIds.length}  (FK is NO ACTION, so explicit)\n`);

  console.log(`Storage objects to remove:   ${targetPaths.length + orphanPaths.length}`);
  console.log(`  attached to the above:     ${targetPaths.length}`);
  console.log(`  already orphaned:          ${orphanPaths.length}`);
  for (const p of orphanPaths) console.log(`    - ${p.split("/").pop()}`);

  if (!COMMIT) {
    console.log("\nDry run complete. Nothing was deleted. Re-run with --commit.");
    return;
  }

  // --- 5. Delete, storage first ---------------------------------------
  const allPaths = [...targetPaths, ...orphanPaths];
  if (allPaths.length > 0) {
    const { error } = await admin.storage.from("cvs").remove(allPaths);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
    console.log(`\nStorage: removed ${allPaths.length} objects.`);
  }

  if (applicationIds.length > 0) {
    const { error } = await admin.from("application").delete().in("id", applicationIds);
    if (error) throw new Error(`application delete failed: ${error.message}`);
    console.log(`Applications: deleted ${applicationIds.length} (cascaded screening/stage_event/message).`);
  }

  if (candidateIds.length > 0) {
    const { error } = await admin.from("candidate").delete().in("id", candidateIds);
    if (error) throw new Error(`candidate delete failed: ${error.message}`);
    console.log(`Candidates: deleted ${candidateIds.length}.`);
  }

  // --- 6. Verify by re-reading, not by trusting the writes ------------
  const after = {
    applications: await countIn(admin, "application", "opening_id", realOpeningIds),
    messages: await countAll(admin, "message"),
    objects: (await listObjects(admin)).length,
  };
  console.log(`\nAfter, re-read from the database:`);
  console.log(`  applications on real openings: ${after.applications}`);
  console.log(`  message rows (all):            ${after.messages}`);
  console.log(`  storage objects (all):         ${after.objects}  (expect the 6 sample CVs)`);
}

async function countIn(
  admin: ReturnType<typeof import("../src/lib/supabase/admin").createAdminClient>,
  table: string,
  column: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, ids);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function countAll(
  admin: ReturnType<typeof import("../src/lib/supabase/admin").createAdminClient>,
  table: string,
): Promise<number> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

/** Every object in the bucket, as full `org/app/file` paths. */
async function listObjects(
  admin: ReturnType<typeof import("../src/lib/supabase/admin").createAdminClient>,
): Promise<string[]> {
  const out: string[] = [];
  const { data: orgs, error: orgErr } = await admin.storage.from("cvs").list("", { limit: 1000 });
  if (orgErr) throw new Error(`storage list failed: ${orgErr.message}`);

  for (const org of orgs ?? []) {
    const { data: appDirs, error: appErr } = await admin.storage
      .from("cvs")
      .list(org.name, { limit: 1000 });
    if (appErr) throw new Error(`storage list failed: ${appErr.message}`);

    for (const dir of appDirs ?? []) {
      const { data: files, error: fErr } = await admin.storage
        .from("cvs")
        .list(`${org.name}/${dir.name}`, { limit: 1000 });
      if (fErr) throw new Error(`storage list failed: ${fErr.message}`);
      for (const f of files ?? []) out.push(`${org.name}/${dir.name}/${f.name}`);
    }
  }
  return out;
}

/**
 * Objects whose `<org>/<application>/<file>` path names an application
 * that no longer exists. Cascade deletes never removed these, so they
 * accumulate silently — real CV data with nothing pointing at it.
 */
async function findOrphanedObjects(
  admin: ReturnType<typeof import("../src/lib/supabase/admin").createAdminClient>,
  liveAppIds: Set<string>,
): Promise<string[]> {
  const objects = await listObjects(admin);
  return objects.filter((p) => {
    const appId = p.split("/")[1];
    return appId !== undefined && !liveAppIds.has(appId);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
