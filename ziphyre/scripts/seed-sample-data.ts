/**
 * M8 seeding — one-off, not part of the app.
 *
 * Builds the sample posting/opening/candidates by calling this
 * project's own real functions: `extractRequirements`, and the actual
 * `runScreenApplication` job handler — the same code the product runs
 * for a real candidate, not a reimplementation of it. The one thing
 * this script does NOT do is drive a browser as a signed-in admin,
 * because no such session is available to it; every write below uses
 * the admin client with the same insert shapes `postings/actions.ts`
 * and `addCandidatesToOpening` already use in production.
 *
 * A score is never written directly. `runScreenApplication` is the
 * only thing in this file that writes to `screening`, and it does so
 * through `record_screening`, the same RPC the real job uses.
 *
 * Run once: npx tsx scripts/seed-sample-data.ts
 */
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// `server-only` throws unconditionally outside Next's bundler. Every
// module below is marked with it. This is the only workaround that
// doesn't touch the modules themselves.
const require = createRequire(import.meta.url);
const resolved = require.resolve("server-only");
require.cache[resolved] = {
  id: resolved,
  filename: resolved,
  loaded: true,
  exports: {},
} as NodeJS.Module;

const CV_DIR = path.resolve(__dirname, "../../MockData/CA-Role-Sample-CVs");
const JD_PATH = path.resolve(__dirname, "../../MockData/CA-Role-Sample-JD.md");

const CANDIDATES = [
  { file: "Ananya_Krishnan_CV.pdf", name: "Ananya Krishnan", bucket: "shortlist" },
  { file: "Rohan_Deshmukh_CV.docx", name: "Rohan Deshmukh", bucket: "shortlist" },
  { file: "Priya_Varadarajan_CV.pdf", name: "Priya Varadarajan", bucket: "neutral" },
  { file: "Vikram_Nair_CV.docx", name: "Vikram Nair", bucket: "neutral" },
  { file: "Kavya_Reddy_CV.pdf", name: "Kavya Reddy", bucket: "reject" },
  { file: "Arjun_Malhotra_CV.docx", name: "Arjun Malhotra", bucket: "reject" },
] as const;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { extractRequirements } = await import("../src/lib/ai/extract-requirements");
  const { getProviderChainForOrg } = await import("../src/lib/provider-settings");
  const { runScreenApplication } = await import(
    "../src/lib/jobs/handlers/screen-application"
  );

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organization")
    .select("id, name")
    .limit(1)
    .single();
  if (orgError || !org) throw new Error(`no organization found: ${orgError?.message}`);
  console.log(`org: ${org.name} (${org.id})`);

  // ---- 1. Posting + opening -------------------------------------------
  const { data: posting, error: postingError } = await admin
    .from("posting")
    .insert({
      organization_id: org.id,
      name: "Sample pipeline — Chartered Accountant",
      apply_token: randomBytes(32).toString("base64url"),
      is_sample: true,
    })
    .select("id")
    .single();
  if (postingError) throw new Error(`posting: ${postingError.message}`);
  console.log(`posting: ${posting.id}`);

  const { data: opening, error: openingError } = await admin
    .from("opening")
    .insert({
      organization_id: org.id,
      posting_id: posting.id,
      title: "Chartered Accountant",
      work_location: "Hyderabad",
    })
    .select("id")
    .single();
  if (openingError) throw new Error(`opening: ${openingError.message}`);
  console.log(`opening: ${opening.id}`);

  // ---- 2. JD -------------------------------------------------------------
  const jdContent = readFileSync(JD_PATH, "utf8");
  const { data: jdVersion, error: jdError } = await admin
    .from("jd_version")
    .insert({
      organization_id: org.id,
      opening_id: opening.id,
      version: 1,
      content: jdContent,
      source: "paste",
    })
    .select("id")
    .single();
  if (jdError) throw new Error(`jd_version: ${jdError.message}`);
  await admin
    .from("opening")
    .update({ current_jd_version_id: jdVersion.id })
    .eq("id", opening.id);
  console.log(`jd_version: ${jdVersion.id}`);

  // ---- 3. Requirements — real extraction, same as FR-13 ------------------
  const chain = await getProviderChainForOrg(org.id);
  if (chain.length === 0) throw new Error("no provider configured for this org");

  let requirementTexts: string[] | null = null;
  let usedFor = "";
  for (const provider of chain) {
    try {
      requirementTexts = await extractRequirements(jdContent, provider);
      usedFor = `${provider.provider}/${provider.model}`;
      break;
    } catch (e) {
      console.warn(`extraction failed on ${provider.provider}: ${(e as Error).message}`);
    }
  }
  if (!requirementTexts || requirementTexts.length === 0) {
    throw new Error("requirement extraction produced nothing");
  }
  console.log(`extracted ${requirementTexts.length} requirements via ${usedFor}`);

  // Same two decisions the real CA opening's admin made (STATUS.md, M2
  // test result): CA qualification and Tally are the hard gates,
  // everything else the extraction found stays preferred.
  const rows = requirementTexts.map((text, i) => {
    const lower = text.toLowerCase();
    const isMustHave =
      (lower.includes("chartered accountant") && lower.includes("qualif")) ||
      lower === "chartered accountant (ca) qualification" ||
      (lower.includes("tally") && !lower.includes("excel"));
    return {
      organization_id: org.id,
      opening_id: opening.id,
      text,
      kind: isMustHave ? "must_have" : "preferred",
      sort_order: i,
    };
  });
  const mustHaveCount = rows.filter((r) => r.kind === "must_have").length;
  if (mustHaveCount === 0) {
    console.warn(
      "WARNING: no requirement matched the CA/Tally must-have heuristic — check the printed list below and mark by hand if needed.",
    );
  }
  rows.forEach((r) => console.log(`  [${r.kind === "must_have" ? "MUST" : "pref"}] ${r.text}`));

  const { error: reqError } = await admin.from("requirement").insert(rows);
  if (reqError) throw new Error(`requirement: ${reqError.message}`);
  console.log(`saved ${rows.length} requirements (${mustHaveCount} must-have)`);

  // ---- 4. Candidates, applications, CVs, real screening -------------------
  for (const c of CANDIDATES) {
    const filePath = path.join(CV_DIR, c.file);
    if (!existsSync(filePath)) throw new Error(`missing CV file: ${filePath}`);
    const ext = c.file.split(".").pop()!;
    const mime = MIME[ext];

    const { data: candidate, error: candError } = await admin
      .from("candidate")
      .insert({
        organization_id: org.id,
        email: `manual+${randomUUID()}@ziphyre.internal`,
        full_name: c.name,
      })
      .select("id")
      .single();
    if (candError) throw new Error(`candidate ${c.name}: ${candError.message}`);

    const { data: application, error: appError } = await admin
      .from("application")
      .insert({
        organization_id: org.id,
        opening_id: opening.id,
        candidate_id: candidate.id,
        source: "manual",
        source_status: "manual",
        submitted_at: new Date().toISOString(),
        status_token: randomBytes(32).toString("base64url"),
      })
      .select("id")
      .single();
    if (appError) throw new Error(`application ${c.name}: ${appError.message}`);

    const storagePath = `${org.id}/${application.id}/${c.file}`;
    const bytes = readFileSync(filePath);
    const { error: uploadError } = await admin.storage
      .from("cvs")
      .upload(storagePath, bytes, { contentType: mime });
    if (uploadError) throw new Error(`upload ${c.name}: ${uploadError.message}`);

    await admin
      .from("application")
      .update({
        cv_storage_path: storagePath,
        cv_mime: mime,
        cv_original_filename: c.file,
      })
      .eq("id", application.id);

    console.log(`\n${c.name} (intended: ${c.bucket}) — screening…`);
    await runScreenApplication(org.id, { applicationId: application.id, reason: "new" });

    const { data: result } = await admin
      .from("application")
      .select(
        "screening_status, screening_failure_reason, current_screening_id, screening:current_screening_id (overall, meets_all_must_haves, must_have_result, provider, model)",
      )
      .eq("id", application.id)
      .single();

    if (result?.screening) {
      const s = result.screening as unknown as {
        overall: number;
        meets_all_must_haves: boolean;
        must_have_result: { requirementId: string; met: boolean; note: string }[];
        provider: string;
        model: string;
      };
      console.log(
        `  -> overall ${s.overall}, must-haves ${s.meets_all_must_haves ? "MET" : "NOT MET"}, scored by ${s.provider}/${s.model}`,
      );
    } else {
      console.log(
        `  -> ${result?.screening_status} — ${result?.screening_failure_reason ?? "no reason recorded"}`,
      );
    }
  }

  console.log("\nDone.");
  console.log(`posting=${posting.id} opening=${opening.id}`);
}

main().catch((e) => {
  console.error("SEEDING FAILED:", e);
  process.exit(1);
});
