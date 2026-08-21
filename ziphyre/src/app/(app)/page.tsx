import type { Metadata } from "next";
import { OverviewClient } from "./overview-client";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
};

export default function HomePage() {
  // No data source yet (tech spec M0). Real counts arrive with M3.
  return <OverviewClient postings={[]} />;
}
