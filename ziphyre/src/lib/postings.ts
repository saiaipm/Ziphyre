import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PostingSummary = {
  id: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  openings: {
    id: string;
    title: string;
    workLocation: string;
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
      "id, name, status, created_at, opening (id, title, work_location, current_jd_version_id)",
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
      requirementCount: counts.get(o.id)?.total ?? 0,
      mustHaveCount: counts.get(o.id)?.mustHave ?? 0,
      hasJd: Boolean(o.current_jd_version_id),
    })),
  }));
}

export type PostingDetail = PostingSummary & {
  closedAt: string | null;
  formId: string | null;
  spreadsheetId: string | null;
  lastImportAt: string | null;
  openingOptionValues: string[];
};

export async function getPostingDetail(
  postingId: string,
): Promise<PostingDetail | null> {
  const supabase = await createClient();
  const { data: posting, error } = await supabase
    .from("posting")
    .select(
      "id, name, status, closed_at, created_at, form_id, spreadsheet_id, last_import_at, opening (id, title, work_location, form_option_value, current_jd_version_id)",
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

  return {
    id: posting.id,
    name: posting.name,
    status: posting.status as "open" | "closed",
    createdAt: posting.created_at,
    closedAt: posting.closed_at,
    formId: posting.form_id,
    spreadsheetId: posting.spreadsheet_id,
    lastImportAt: posting.last_import_at,
    openingOptionValues: posting.opening.map((o) => o.form_option_value),
    openings: posting.opening.map((o) => ({
      id: o.id,
      title: o.title,
      workLocation: o.work_location,
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
      "id, title, work_location, posting_id, current_jd_version_id, posting:posting_id (id, name, status)",
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

export type UnmatchedRow = {
  id: string;
  claimedOption: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
};

/** FR-28. Only submissions still awaiting assignment. */
export async function getUnmatchedForPosting(
  postingId: string,
): Promise<UnmatchedRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unmatched_submission")
    .select("id, claimed_option, raw_answers")
    .eq("posting_id", postingId)
    .is("resolved_application_id", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const raw = (row.raw_answers ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      claimedOption: row.claimed_option,
      candidateName: typeof raw._fullName === "string" ? raw._fullName : null,
      candidateEmail: typeof raw._email === "string" ? raw._email : null,
    };
  });
}
