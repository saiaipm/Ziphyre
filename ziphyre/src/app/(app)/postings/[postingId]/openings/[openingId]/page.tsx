import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOpeningDetail } from "@/lib/postings";
import { getApplicationsForOpening } from "@/lib/applications";
import { OpeningWorkspace } from "./opening-workspace";

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
