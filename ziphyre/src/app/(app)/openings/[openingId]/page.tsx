import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Pipeline" };

export default function OpeningPipelinePage() {
  return (
    <NotBuiltYet
      title="Pipeline"
      milestone="M4"
      summary="Every application for this opening with its five component ratings, overall score, must-have result and stage — filterable, sortable, and workable in batches. Screening itself lands first, at M2."
    />
  );
}
