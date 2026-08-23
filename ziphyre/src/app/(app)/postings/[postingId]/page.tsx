import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPostingDetail, getUnmatchedForPosting } from "@/lib/postings";
import { getSessionContext } from "@/lib/session";
import { getConnection } from "@/lib/google/auth";
import { PostingActions } from "./posting-actions";
import { PostingTitle } from "./posting-title";
import { FormConnection } from "./form-connection";
import { UnmatchedQueue } from "./unmatched-queue";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postingId: string }>;
}): Promise<Metadata> {
  const { postingId } = await params;
  const posting = await getPostingDetail(postingId);
  return { title: posting?.name ?? "Posting" };
}

export default async function PostingDetailPage({
  params,
}: {
  params: Promise<{ postingId: string }>;
}) {
  const { postingId } = await params;
  const posting = await getPostingDetail(postingId);
  if (!posting) notFound();

  const isClosed = posting.status === "closed";
  const session = await getSessionContext();
  const connection = session
    ? await getConnection(session.organization.id)
    : null;
  const unmatched = await getUnmatchedForPosting(postingId);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PostingTitle
          postingId={posting.id}
          name={posting.name}
          openingCount={posting.openings.length}
          isClosed={isClosed}
        />
        <PostingActions
          postingId={posting.id}
          postingName={posting.name}
          isClosed={isClosed}
        />
      </div>

      <UnmatchedQueue
        items={unmatched}
        openings={posting.openings.map((o) => ({ id: o.id, title: o.title }))}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-meta">Openings</h2>
          {!isClosed && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/postings/${posting.id}/openings/new`}>
                <Plus className="size-3.5" aria-hidden />
                Add opening
              </Link>
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {posting.openings.map((o) => (
            <Link
              key={o.id}
              href={`/postings/${posting.id}/openings/${o.id}`}
              className="elev-hover flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {o.workLocation}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {!o.hasJd ? (
                  <span className="flex items-center gap-1.5 text-xs text-fit-review">
                    <FileWarning className="size-3.5" aria-hidden />
                    No job description
                  </span>
                ) : o.requirementCount === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No requirements set
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {o.mustHaveCount} must-have
                    {o.mustHaveCount === 1 ? "" : "s"} · {o.requirementCount}{" "}
                    total
                  </span>
                )}
                <ArrowRight
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {!isClosed && (
        <FormConnection
          postingId={posting.id}
          openingOptions={posting.openingOptionValues}
          googleConnected={connection?.status === "active"}
          connectedFormId={posting.formId}
          lastImportAt={posting.lastImportAt}
        />
      )}
    </div>
  );
}
