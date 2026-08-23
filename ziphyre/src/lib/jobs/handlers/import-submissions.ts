import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/queue";
import { GoogleNeedsReconnectError } from "@/lib/google/auth";
import {
  readSheetRows,
  downloadDriveFile,
  driveFileIdFromUrl,
} from "@/lib/google/forms";
import { mapColumns, parseRow } from "@/lib/google/parse-response";
import type { ImportSubmissionsPayload } from "@/lib/jobs/types";

const CV_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function normaliseCvMime(mimeType: string, filename: string): string {
  if (Object.values(CV_MIME_BY_EXTENSION).includes(mimeType)) return mimeType;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return CV_MIME_BY_EXTENSION[ext] ?? mimeType;
}

/**
 * Tech spec §5.3. Reads response-sheet rows after `last_imported_row` and
 * turns each into an application, then advances the cursor.
 *
 * Background jobs bypass RLS, so every query filters `organization_id`
 * explicitly (tech spec §3).
 */
export async function runImportSubmissions(
  organizationId: string,
  payload: ImportSubmissionsPayload,
): Promise<void> {
  const admin = createAdminClient();
  const { postingId } = payload;

  const { data: posting, error: postingError } = await admin
    .from("posting")
    .select("id, status, spreadsheet_id, last_imported_row")
    .eq("id", postingId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (postingError) throw postingError;
  if (!posting) throw new Error(`posting ${postingId} not found`);

  // FR-10: a closed posting stops accepting new applications. Everything
  // already imported stays fully workable.
  if (posting.status !== "open" || !posting.spreadsheet_id) return;

  const { data: openings, error: openingsError } = await admin
    .from("opening")
    .select("id, form_option_value")
    .eq("posting_id", postingId)
    .eq("organization_id", organizationId);
  if (openingsError) throw openingsError;

  const openingByOption = new Map(
    (openings ?? []).map((o) => [o.form_option_value, o.id]),
  );

  const rows = await readSheetRows(organizationId, posting.spreadsheet_id);
  if (rows.length < 2) return;

  const columns = mapColumns(rows[0]);
  // Row 1 is the header, so sheet row N is rows[N-1]. `last_imported_row`
  // starts at 1 (the header) and counts in sheet terms throughout.
  const startRow = Math.max(posting.last_imported_row, 1);

  let lastGoodRow = startRow;

  for (let sheetRow = startRow + 1; sheetRow <= rows.length; sheetRow++) {
    const row = rows[sheetRow - 1];
    try {
      await importRow({
        organizationId,
        postingId,
        row,
        sheetRow,
        columns,
        openingByOption,
      });
      lastGoodRow = sheetRow;
    } catch (err) {
      // A revoked grant isn't a bad row — stop and let the connection be
      // repaired, without advancing past rows we never actually imported.
      if (err instanceof GoogleNeedsReconnectError) throw err;

      // §5.3: a row that fails is recorded and skipped. One malformed
      // submission must never block intake for the whole posting.
      console.error(
        `[import_submissions] posting ${postingId} row ${sheetRow} failed`,
        err,
      );
      lastGoodRow = sheetRow;
    }
  }

  await admin
    .from("posting")
    .update({
      last_imported_row: lastGoodRow,
      last_import_at: new Date().toISOString(),
    })
    .eq("id", postingId)
    .eq("organization_id", organizationId);
}

async function importRow(input: {
  organizationId: string;
  postingId: string;
  row: string[];
  sheetRow: number;
  columns: ReturnType<typeof mapColumns>;
  openingByOption: Map<string, string>;
}): Promise<void> {
  const { organizationId, postingId, row, sheetRow, columns, openingByOption } =
    input;
  const admin = createAdminClient();
  const parsed = parseRow(row, columns);

  const cvFileId = parsed.cvCell ? driveFileIdFromUrl(parsed.cvCell) : null;

  // FR-30/FR-37: identity is the verified email. Without one there is no
  // candidate to attach anything to.
  if (!parsed.email) {
    throw new Error(
      "row has no email address — check the form collects verified emails",
    );
  }

  const openingId = parsed.claimedOption
    ? openingByOption.get(parsed.claimedOption)
    : undefined;

  // FR-28: an unrecognised option is retained as Unmatched, never discarded.
  if (!openingId) {
    const { error } = await admin.from("unmatched_submission").insert({
      organization_id: organizationId,
      posting_id: postingId,
      claimed_option: parsed.claimedOption,
      raw_answers: {
        ...parsed.formAnswers,
        _email: parsed.email,
        _fullName: parsed.fullName,
      },
      cv_drive_file_id: cvFileId,
      source_row_number: sheetRow,
    });
    if (error) throw error;
    return;
  }

  const candidateId = await resolveCandidate(
    organizationId,
    parsed.email,
    parsed.fullName,
  );

  const { data: existing } = await admin
    .from("application")
    .select("id, cv_storage_path")
    .eq("opening_id", openingId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  const cv = cvFileId
    ? await downloadDriveFile(organizationId, cvFileId)
    : null;

  if (existing) {
    // FR-36: a repeat submission updates in place. The previous CV is
    // retained and the stage is left exactly where the admin put it —
    // a resubmission is new information, not a reason to undo a decision.
    const update: Record<string, unknown> = {
      form_answers: parsed.formAnswers,
      resubmitted_at: new Date().toISOString(),
      source_row_number: sheetRow,
      source_status: "present",
    };

    if (cv) {
      const path = await storeCv(organizationId, existing.id, cv);
      update.previous_cv_storage_path = existing.cv_storage_path;
      update.cv_storage_path = path;
      update.cv_mime = normaliseCvMime(cv.mimeType, cv.name);
      update.cv_original_filename = cv.name;
      update.cv_drive_file_id = cvFileId;
      update.screening_status = "pending";
    }

    const { error } = await admin
      .from("application")
      .update(update)
      .eq("id", existing.id)
      .eq("organization_id", organizationId);
    if (error) throw error;

    if (cv) {
      await enqueueJob(organizationId, "screen_application", {
        applicationId: existing.id,
        reason: "rescreen",
      });
    }
    return;
  }

  const { data: application, error: insertError } = await admin
    .from("application")
    .insert({
      organization_id: organizationId,
      opening_id: openingId,
      candidate_id: candidateId,
      source: "form",
      source_status: "present",
      source_row_number: sheetRow,
      form_answers: parsed.formAnswers,
      submitted_at: new Date().toISOString(),
      cv_drive_file_id: cvFileId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  if (!cv) {
    // FR-47: no readable CV is a manual-review state, never a zero score.
    await admin
      .from("application")
      .update({
        screening_status: "needs_manual_review",
        screening_failure_reason:
          "No CV was attached to this submission, or the file couldn't be found in Drive.",
      })
      .eq("id", application.id)
      .eq("organization_id", organizationId);
    return;
  }

  const path = await storeCv(organizationId, application.id, cv);
  const { error: cvError } = await admin
    .from("application")
    .update({
      cv_storage_path: path,
      cv_mime: normaliseCvMime(cv.mimeType, cv.name),
      cv_original_filename: cv.name,
    })
    .eq("id", application.id)
    .eq("organization_id", organizationId);
  if (cvError) throw cvError;

  await enqueueJob(organizationId, "screen_application", {
    applicationId: application.id,
    reason: "new",
  });
}

/** FR-37: one verified email is one candidate, across every opening. */
async function resolveCandidate(
  organizationId: string,
  email: string,
  fullName: string | null,
): Promise<string> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("candidate")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (!existing.full_name && fullName) {
      await admin
        .from("candidate")
        .update({ full_name: fullName })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("candidate")
    .insert({ organization_id: organizationId, email, full_name: fullName })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

/**
 * Fetches a CV from Drive and files it against an application. Shared with
 * the unmatched-assign path (FR-29), which reaches an application the same
 * way but from a different direction.
 */
export async function attachCvFromDrive(
  organizationId: string,
  applicationId: string,
  driveFileId: string,
): Promise<void> {
  const admin = createAdminClient();
  const cv = await downloadDriveFile(organizationId, driveFileId);
  const path = await storeCv(organizationId, applicationId, cv);

  const { error } = await admin
    .from("application")
    .update({
      cv_storage_path: path,
      cv_mime: normaliseCvMime(cv.mimeType, cv.name),
      cv_original_filename: cv.name,
    })
    .eq("id", applicationId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/**
 * Copies the CV into our own Storage. TechDecisions §5.3: we keep a working
 * copy so the pipeline stays readable even if Google access later lapses.
 */
async function storeCv(
  organizationId: string,
  applicationId: string,
  cv: { bytes: Buffer; mimeType: string; name: string },
): Promise<string> {
  const admin = createAdminClient();
  const path = `${organizationId}/${applicationId}/${cv.name}`;
  const { error } = await admin.storage
    .from("cvs")
    .upload(path, cv.bytes, {
      contentType: normaliseCvMime(cv.mimeType, cv.name),
      upsert: true,
    });
  if (error) throw error;
  return path;
}
