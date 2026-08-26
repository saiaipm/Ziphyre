import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UploadSlotSchema } from "@/lib/apply/schema";
import {
  CV_BUCKET,
  checkRateLimit,
  clientIp,
  getPublicPosting,
  hasExistingApplication,
  hashIp,
  openingBelongsToPosting,
  pendingCvPath,
} from "@/lib/apply/server";

/**
 * Step 1 of tech spec §5.2. Public.
 *
 * Every check that can refuse an application happens here, *before* a
 * signed URL exists — so a candidate who has already applied, or is
 * rate-limited, or picked the wrong file, never uploads a byte. Doing
 * this after the upload would waste their bandwidth and leave an
 * orphaned object behind, caused entirely by our own ordering.
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

  const ipHash = hashIp(clientIp(request));
  if (!(await checkRateLimit(posting.postingId, ipHash))) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const parsed = UploadSlotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { openingId, email, filename, mime } = parsed.data;

  if (!(await openingBelongsToPosting(openingId, posting.postingId))) {
    return NextResponse.json({ error: "invalid_opening" }, { status: 400 });
  }

  // FR-95, checked before anything is uploaded.
  if (await hasExistingApplication(posting.organizationId, openingId, email)) {
    return NextResponse.json(
      { error: "already_applied", message: "You've already applied for this role." },
      { status: 409 },
    );
  }

  const storagePath = pendingCvPath(posting.organizationId, token, filename);
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CV_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: "upload_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    token: data.token,
    path: storagePath,
    mime,
  });
}
