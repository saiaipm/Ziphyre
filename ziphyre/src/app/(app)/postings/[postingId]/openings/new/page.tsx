import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostingDetail } from "@/lib/postings";
import { NewOpeningForm } from "./new-opening-form";

export const metadata: Metadata = { title: "New opening" };

export default async function NewOpeningPage({
  params,
}: {
  params: Promise<{ postingId: string }>;
}) {
  const { postingId } = await params;
  const posting = await getPostingDetail(postingId);
  if (!posting) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">
          New opening
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adding to <span className="font-medium text-foreground">{posting.name}</span>.
          Screened independently against its own job description.
        </p>
      </div>
      <NewOpeningForm postingId={posting.id} />
    </div>
  );
}
