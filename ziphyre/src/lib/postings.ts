import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_STAGE_COUNTS,
  type StageCounts,
} from "@/components/pipeline/stage-funnel";
import type { StageKey } from "@/lib/stages";

export type PostingSummary = {
  id: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  openings: {
    id: string;
    title: string;
    workLocation: string;
    createdAt: string;
    requirementCount: number;
    mustHaveCount: number;
    hasJd: boolean;
  }[];
};

/**
 * Application counts aren't queried here yet — the overview/pipeline
 * summary (FR-77) is M6 (Home & retention). `application` exists as
 * of M2, but every opening still reads as zero applied/screened/
 * shortlisted on this screen until that summary is built.
 */
export async function getPostingsForOrg(): Promise<PostingSummary[]> {
  const supabase = await createClient();

  const { data: postings, error } = await supabase
    .from("posting")
    .select(
      "id, name, status, created_at, opening (id, title, work_location, created_at, current_jd_version_id)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!postings) return [];

  const openingIds = postings.flatMap((p) => p.opening.map((o) => o.id));

  const counts = new Map<string, { total: number; mustHave: number }>();
  if (openingIds.length > 0) {
    const { data: reqs } = await supabase
      .from("requirement")
      .select("opening_id, kind")
      .in("opening_id", openingIds);

    for (const r of reqs ?? []) {
      const entry = counts.get(r.opening_id) ?? { total: 0, mustHave: 0 };
      entry.total += 1;
      if (r.kind === "must_have") entry.mustHave += 1;
      counts.set(r.opening_id, entry);
    }
  }

  return postings.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as "open" | "closed",
    createdAt: p.created_at,
    openings: p.opening.map((o) => ({
      id: o.id,
      title: o.title,
      workLocation: o.work_location,
      createdAt: o.created_at,
      requirementCount: counts.get(o.id)?.total ?? 0,
      mustHaveCount: counts.get(o.id)?.mustHave ?? 0,
      hasJd: Boolean(o.current_jd_version_id),
    })),
  }));
}

export type PostingDetail = PostingSummary & {
  closedAt: string | null;
  /** Tech spec §11: when this posting's candidate data is deleted. */
  purgeAfter: string | null;
  /**
   * Days until that happens, computed here rather than in the component
   * that shows it. `Date.now()` during render is impure — this codebase's
   * lint rejects it, and rightly: the same render would produce a
   * different number depending on when React happened to run it.
   */
  daysUntilPurge: number | null;
  applyToken: string;
  /**
   * The posting-wide roll-up shown above its openings — the same shape
   * the home and opening summaries use, so all three render through one
   * funnel component. Per-opening counts ride along on each opening so
   * the list can show where the candidates actually are.
   */
  metrics: {
    totalApplications: number;
    byStage: StageCounts;
    needsReview: number;
    perOpening: Map<string, { total: number; shortlisted: number }>;
  };
};

export async function getPostingDetail(
  postingId: string,
): Promise<PostingDetail | null> {
  const supabase = await createClient();
  const { data: posting, error } = await supabase
    .from("posting")
    .select(
      "id, name, status, closed_at, purge_after, created_at, apply_token, opening (id, title, work_location, created_at, current_jd_version_id)",
    )
    .eq("id", postingId)
    .maybeSingle();

  if (error) throw error;
  if (!posting) return null;

  const openingIds = posting.opening.map((o) => o.id);
  const counts = new Map<string, { total: number; mustHave: number }>();
  if (openingIds.length > 0) {
    const { data: reqs } = await supabase
      .from("requirement")
      .select("opening_id, kind")
      .in("opening_id", openingIds);
    for (const r of reqs ?? []) {
      const entry = counts.get(r.opening_id) ?? { total: 0, mustHave: 0 };
      entry.total += 1;
      if (r.kind === "must_have") entry.mustHave += 1;
      counts.set(r.opening_id, entry);
    }
  }

  // One query for every application on the posting, counted in memory.
  // §15 puts the ceiling at several hundred per opening, so this stays
  // cheaper than five aggregate round trips — and counting here rather
  // than in SQL keeps the funnel's arithmetic (FR-102) in one place.
  const metrics = {
    totalApplications: 0,
    byStage: { ...EMPTY_STAGE_COUNTS },
    needsReview: 0,
    perOpening: new Map<string, { total: number; shortlisted: number }>(),
  };

  if (openingIds.length > 0) {
    const { data: applications } = await supabase
      .from("application")
      .select("opening_id, current_stage, screening_status")
      .in("opening_id", openingIds);

    for (const a of applications ?? []) {
      const stage = a.current_stage as StageKey;
      if (!(stage in metrics.byStage)) continue;
      metrics.byStage[stage] += 1;
      metrics.totalApplications += 1;
      if (a.screening_status === "needs_manual_review") metrics.needsReview += 1;

      const entry = metrics.perOpening.get(a.opening_id) ?? {
        total: 0,
        shortlisted: 0,
      };
      entry.total += 1;
      if (stage === "shortlisted") entry.shortlisted += 1;
      metrics.perOpening.set(a.opening_id, entry);
    }
  }

  return {
    id: posting.id,
    name: posting.name,
    status: posting.status as "open" | "closed",
    createdAt: posting.created_at,
    closedAt: posting.closed_at,
    purgeAfter: posting.purge_after,
    daysUntilPurge: posting.purge_after
      ? Math.ceil(
          (new Date(posting.purge_after).getTime() - Date.now()) / 86_400_000,
        )
      : null,
    applyToken: posting.apply_token,
    metrics,
    openings: posting.opening.map((o) => ({
      id: o.id,
      title: o.title,
      workLocation: o.work_location,
      createdAt: o.created_at,
      requirementCount: counts.get(o.id)?.total ?? 0,
      mustHaveCount: counts.get(o.id)?.mustHave ?? 0,
      hasJd: Boolean(o.current_jd_version_id),
    })),
  };
}

export async function getOpeningDetail(openingId: string) {
  const supabase = await createClient();
  const { data: opening, error } = await supabase
    .from("opening")
    .select(
      "id, title, work_location, created_at, posting_id, current_jd_version_id, posting:posting_id (id, name, status)",
    )
    .eq("id", openingId)
    .maybeSingle();

  if (error) throw error;
  if (!opening) return null;

  const [{ data: jdVersion }, { data: requirements }] = await Promise.all([
    opening.current_jd_version_id
      ? supabase
          .from("jd_version")
          .select("id, version, content, source, created_at")
          .eq("id", opening.current_jd_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("requirement")
      .select("id, text, kind, sort_order")
      .eq("opening_id", openingId)
      .order("sort_order", { ascending: true }),
  ]);

  return { opening, jdVersion, requirements: requirements ?? [] };
}
