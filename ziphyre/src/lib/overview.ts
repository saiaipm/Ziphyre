import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StageKey } from "@/lib/stages";

/**
 * FR-101 – FR-105. The organisation-wide summary above the per-opening
 * list on the home screen.
 *
 * The stage vocabulary moved to `@/lib/stages` in M4 so client
 * components could share it; it is re-exported here so existing
 * importers keep working and there is still only one definition.
 */

export { STAGE_ORDER, STAGE_LABELS, type StageKey } from "@/lib/stages";

export type OverviewMetrics = {
  activePostings: number;
  activeOpenings: number;
  totalApplications: number;
  /** FR-102. These five sum to totalApplications, always. */
  byStage: Record<StageKey, number>;
  /**
   * FR-103. NOT a stage — a screening status. Every application counted
   * here is also counted once in `byStage`, at whatever stage it sits
   * in. Presenting it as a sixth funnel step would double-count it.
   */
  needsReview: number;
  /** Whether any closed posting exists, so the UI can offer to include them. */
  hasClosed: boolean;
};

const EMPTY_STAGES: Record<StageKey, number> = {
  new: 0,
  screened: 0,
  shortlisted: 0,
  on_hold: 0,
  rejected: 0,
};

/**
 * FR-104. Active postings only by default. A total that also counts
 * every posting ever closed only grows, and stops meaning anything.
 */
export async function getOverviewMetrics(
  includeClosed = false,
): Promise<OverviewMetrics> {
  const supabase = await createClient();

  const { data: postings } = await supabase
    .from("posting")
    .select("id, status, opening (id)");

  const all = postings ?? [];
  const counted = includeClosed ? all : all.filter((p) => p.status === "open");

  const openingIds = counted.flatMap((p) => p.opening.map((o) => o.id));

  const metrics: OverviewMetrics = {
    activePostings: counted.length,
    activeOpenings: openingIds.length,
    totalApplications: 0,
    byStage: { ...EMPTY_STAGES },
    needsReview: 0,
    hasClosed: all.some((p) => p.status === "closed"),
  };

  if (openingIds.length === 0) return metrics;

  const { data: applications } = await supabase
    .from("application")
    .select("current_stage, screening_status")
    .in("opening_id", openingIds);

  for (const a of applications ?? []) {
    const stage = a.current_stage as StageKey;
    if (stage in metrics.byStage) {
      metrics.byStage[stage] += 1;
      metrics.totalApplications += 1;
    }
    if (a.screening_status === "needs_manual_review") {
      metrics.needsReview += 1;
    }
  }

  return metrics;
}
