import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPosting } from "@/lib/apply/server";
import { ApplyForm } from "./apply-form";

/**
 * The product's only public page (FR-87 – FR-100, tech spec §5.1).
 *
 * Renders the organisation's name and the openings that can receive an
 * application, and nothing else. No candidate, no score, no other
 * posting — FR-99.
 *
 * The posting's own name is deliberately absent: it is Meera's internal
 * label ("Finance hiring, August") and was never meant for candidates.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const posting = await getPublicPosting(token);
  return {
    title: posting ? `Apply to ${posting.organizationName}` : "Apply",
    robots: { index: false, follow: false },
  };
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const posting = await getPublicPosting(token);
  if (!posting) notFound();

  const closed = posting.status === "closed";
  const nothingOpen = posting.openings.length === 0;

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-[26px] leading-tight font-semibold sm:text-[30px]">
          Apply to {posting.organizationName}
        </h1>
      </header>

      {closed ? (
        <Notice>This role isn&rsquo;t accepting applications any more.</Notice>
      ) : nothingOpen ? (
        <Notice>
          There&rsquo;s nothing open to apply for here just yet. Do check back.
        </Notice>
      ) : (
        <ApplyForm
          token={token}
          organizationName={posting.organizationName}
          openings={posting.openings}
        />
      )}
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
