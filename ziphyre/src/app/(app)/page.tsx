import type { Metadata } from "next";
import { OverviewClient } from "./overview-client";
import { OverviewSummary } from "./overview-summary";
import { getPostingsForOrg } from "@/lib/postings";
import { getOverviewMetrics } from "@/lib/overview";
import { getSessionContext } from "@/lib/session";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
};

export default async function HomePage() {
  const [postings, metrics, session] = await Promise.all([
    getPostingsForOrg(),
    getOverviewMetrics(),
    getSessionContext(),
  ]);

  return (
    <OverviewClient
      postings={postings}
      showSampleData={session?.organization.show_sample_data ?? true}
      summary={<OverviewSummary metrics={metrics} />}
    />
  );
}
