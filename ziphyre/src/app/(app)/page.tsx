import type { Metadata } from "next";
import { OverviewClient } from "./overview-client";
import { getPostingsForOrg } from "@/lib/postings";

export const metadata: Metadata = {
  title: "Hiring Pipeline",
};

export default async function HomePage() {
  const postings = await getPostingsForOrg();
  return <OverviewClient postings={postings} />;
}
