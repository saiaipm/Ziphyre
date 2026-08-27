import type { Metadata } from "next";
import { OverviewClient } from "./overview-client";
import { OverviewSummary } from "./overview-summary";
import { getPostingsForOrg } from "@/lib/postings";
import { getOverviewMetrics } from "@/lib/overview";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
};

export default async function HomePage() {
  const [postings, metrics] = await Promise.all([
    getPostingsForOrg(),
    getOverviewMetrics(),
  ]);

  return (
    <OverviewClient
      postings={postings}
      summary={<OverviewSummary metrics={metrics} />}
    />
  );
}
