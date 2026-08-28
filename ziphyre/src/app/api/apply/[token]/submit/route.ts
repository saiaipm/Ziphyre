import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/queue";
import { runQueuedJobs } from "@/lib/jobs/runner";
import { MAX_CV_BYTES, ALLOWED_CV_MIME, SubmitSchema } from "@/lib/apply/schema";
import { queueMessage, statusUrl } from "@/lib/mail/send";
import {


  CV_BUCKET,
  clientIp,
  getPublicPosting,
  hasExistingApplication,
  hashIp,
  openingBelongsToPosting,
  recordAttempt,
  verifyUploadedObject,
} from "@/lib/apply/server";

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
 * Step 3 of tech spec §5.2. Public.
 *
 * Re-checks everything step 1 checked, because the two calls are not
 * atomic, and then verifies the uploaded object against Storage rather
 * than believing what the browser says it uploaded.
 *
 * Returns as soon as the row exists (FR-96). Screening is a queued job;
 * the candidate waits for none of it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const posting = await getPublicPosting(token);
  if (!posting) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (posting.status === "closed") {
    return NextResponse.json(
      { error: "closed", message: "This role isn't accepting applications any more." },
      { status: 409 },
    );
  }

  const parsed = SubmitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Honeypot (§5.3). Answer as though it worked — telling a bot exactly
  // which check caught it just teaches it to pass next time.
  if (f.website) {
    return NextResponse.json({ ok: true });
  }

  if (!(await openingBelongsToPosting(f.openingId, posting.postingId))) {
    return NextResponse.json({ error: "invalid_opening" }, { status: 400 });
  }

  if (await hasExistingApplication(posting.organizationId, f.openingId, f.email)) {
    return NextResponse.json(
      { error: "already_applied", message: "You've already applied for this role." },
      { status: 409 },
    );
  }

  // Nothing about the file is taken on trust — §5.2.
  const object = await verifyUploadedObject(
    f.storagePath,
    posting.organizationId,
    token,
  );
  if (!object.ok) {
    return NextResponse.json({ error: "cv_missing", message: object.reason }, { status: 400 });
  }
  if (object.size > MAX_CV_BYTES) {
    return NextResponse.json(
      { error: "cv_too_large", message: "That file is over 1 MB. Please choose a smaller one." },
      { status: 400 },
    );
  }
  if (!(ALLOWED_CV_MIME as readonly string[]).includes(object.mime)) {
    return NextResponse.json(
      { error: "cv_wrong_type", message: "Please choose a PDF or a Word (.docx) file." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ipHash = hashIp(clientIp(request));

  // FR-37: one person, many applications. Reuse the candidate if this
  // email has applied to another opening in the organisation.
  const { data: existing } = await admin
    .from("candidate")
    .select("id")
    .eq("organization_id", posting.organizationId)
    .eq("email", f.email)
    .maybeSingle();

  let candidateId = existing?.id;
  if (!candidateId) {
    const { data: created, error } = await admin
      .from("candidate")
      .insert({
        organization_id: posting.organizationId,
        email: f.email,
        full_name: f.fullName,
        // email_verified stays false — nothing here proves the address
        // (PN-002 Decision 3).
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
    candidateId = created.id;
  }

  const { data: application, error: applicationError } = await admin
    .from("application")
    .insert({
      organization_id: posting.organizationId,
      opening_id: f.openingId,
      candidate_id: candidateId,
      source: "apply",
      source_status: "present",
      submitted_at: new Date().toISOString(),
      form_answers: {
        currentLocation: f.currentLocation,
        willingnessToRelocate: f.willingnessToRelocate,
        experienceYears: f.experienceYears,
        experienceMonths: f.experienceMonths,
        noticePeriod: f.noticePeriod,
        currentCtc: f.currentCtc,
        expectedCtc: f.expectedCtc,
      },
    })
    .select("id, status_token")
    .single();

  if (applicationError || !application) {
    // The unique (opening_id, candidate_id) backstop, if the duplicate
    // check above lost a race with a concurrent submission.
    if (applicationError?.code === "23505") {
      return NextResponse.json(
        { error: "already_applied", message: "You've already applied for this role." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Move the CV out of the pending folder into the standard layout, so
  // everything downstream sees one shape (§5.2).
  const filename = f.storagePath.slice(f.storagePath.lastIndexOf("/") + 1);
  const finalPath = `${posting.organizationId}/${application.id}/${filename}`;
  const { error: moveError } = await admin.storage
    .from(CV_BUCKET)
    .move(f.storagePath, finalPath);

  const cvPath = moveError ? f.storagePath : finalPath;

  await admin
    .from("application")
    .update({
      cv_storage_path: cvPath,
      cv_mime: object.mime,
      cv_original_filename: filename.replace(/^[0-9a-f-]{36}-/, ""),
    })
    .eq("id", application.id);

  await enqueueJob(posting.organizationId, "screen_application", {
    applicationId: application.id,
    reason: "new",
  });

  // FR-117. The only message Ziphyre sends without a person choosing
  // to — and the direct expression of Principle 4: the candidate can
  // find out where they stand without asking anyone.
  //
  // FR-118: intake never depends on mail working. A failure here is
  // recorded in the outbox and the application is still accepted and
  // screened; it must not cost the candidate their submission.
  try {
    await queueMessage({
      organizationId: posting.organizationId,
      applicationId: application.id,
      kind: "application_received",
      toEmail: f.email,
      vars: {
        candidateName: f.fullName,
        roleTitle:
          posting.openings.find((o) => o.id === f.openingId)?.title ??
          "the role",
        organisationName: posting.organizationName,
        statusLink: statusUrl(application.status_token),
      },
      sentBy: null,
    });
  } catch {
    // Deliberately swallowed — see FR-118 above.
  }

  await recordAttempt(posting.postingId, ipHash);

  // Screening runs after the response is sent, never during it (FR-96).
  after(() => {
    runQueuedJobs({ kinds: ["screen_application", "send_message"] }).catch(
      () => {},
    );
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
