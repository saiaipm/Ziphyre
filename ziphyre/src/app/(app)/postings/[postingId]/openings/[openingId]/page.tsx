import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOpeningDetail } from "@/lib/postings";
import { getSessionContext } from "@/lib/session";
import { getMailSettings } from "@/lib/mail/send";
import { getApplicationsForOpening } from "@/lib/applications";
import { OpeningWorkspace } from "./opening-workspace";

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


export async function generateMetadata({
  params,
}: {
  params: Promise<{ openingId: string }>;
}): Promise<Metadata> {
  const { openingId } = await params;
  const detail = await getOpeningDetail(openingId);
  return { title: detail?.opening.title ?? "Opening" };
}

export default async function OpeningDetailPage({
  params,
}: {
  params: Promise<{ postingId: string; openingId: string }>;
}) {
  const { postingId, openingId } = await params;
  const detail = await getOpeningDetail(openingId);
  // FR-131: the opening stores no copy of the organisation's link, so
  // changing the default in Settings reaches every opening that never
  // set its own.
  const session = await getSessionContext();
  const orgBookingUrl = session
    ? ((await getMailSettings(session.organization.id))?.bookingUrl ?? null)
    : null;
  if (!detail || detail.opening.posting_id !== postingId) notFound();

  const { opening, jdVersion, requirements } = detail;
  const postingRef = opening.posting as unknown as { name: string } | null;
  const applications = await getApplicationsForOpening(openingId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/postings/${postingId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {postingRef?.name ?? "Back to posting"}
      </Link>

      <OpeningWorkspace
        openingId={opening.id}
        postingId={postingId}
        title={opening.title}
        workLocation={opening.work_location}
        createdAt={opening.created_at}
        bookingUrl={opening.booking_url}
        orgBookingUrl={orgBookingUrl}
        jdContent={jdVersion?.content ?? null}
        jdVersion={jdVersion?.version ?? null}
        initialRequirements={requirements.map((r) => ({
          id: r.id,
          text: r.text,
          kind: r.kind as "must_have" | "preferred",
        }))}
        initialApplications={applications}
      />
    </div>
  );
}
