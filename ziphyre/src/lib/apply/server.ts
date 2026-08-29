import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server helpers for the one public surface in the product (tech spec §5).
 *
 * Everything here runs with the elevated client and **no session**, so
 * §3's rule for background jobs applies with full force: every query is
 * scoped by the posting resolved from the apply token, and nothing is
 * ever trusted from the client.
 */

export const CV_BUCKET = "cvs";

export type PublicPosting = {
  postingId: string;
  organizationId: string;
  organizationName: string;
  status: "open" | "closed";
  openings: {
    id: string;
    title: string;
    workLocation: string;
    /**
     * What screening actually measures a candidate against — the same
     * text `JdCard` shows an admin, not the original upload (JD upload
     * stores text, never the file; see TechDecisions). A candidate who
     * reads the JD before applying, and most do, has had nothing to
     * read on this page since it launched.
     */
    jdContent: string;
    jdVersion: number;
  }[];
};

/**
 * Resolves an apply token to the little that may be shown publicly:
 * the organisation's name, and the openings that can actually receive
 * an application (FR-89 — an opening with no JD is not offered, because
 * FR-8 says it cannot receive one).
 *
 * Returns null for an unknown token so the route can 404 without
 * distinguishing "no such posting" from "not yours".
 */
export async function getPublicPosting(
  token: string,
): Promise<PublicPosting | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("posting")
    .select(
      `id, status, organization_id, organization:organization_id (name),
       opening (
         id, title, work_location, current_jd_version_id,
         jd_version:current_jd_version_id (version, content)
       )`,
    )
    .eq("apply_token", token)
    .maybeSingle();

  if (!data) return null;

  const org = data.organization as unknown as { name: string } | null;
  const openings = (data.opening ?? [])
    .filter((o) => Boolean(o.current_jd_version_id))
    .map((o) => {
      const jd = o.jd_version as unknown as {
        version: number;
        content: string;
      } | null;
      return {
        id: o.id,
        title: o.title,
        workLocation: o.work_location,
        // `!` is safe: the filter above already requires
        // current_jd_version_id, and the FK guarantees the join resolves.
        jdContent: jd!.content,
        jdVersion: jd!.version,
      };
    });

  return {
    postingId: data.id,
    organizationId: data.organization_id,
    organizationName: org?.name ?? "this employer",
    status: data.status as "open" | "closed",
    openings,
  };
}

/** The opening must belong to this posting and be ready to receive (FR-8). */
export async function openingBelongsToPosting(
  openingId: string,
  postingId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("opening")
    .select("id")
    .eq("id", openingId)
    .eq("posting_id", postingId)
    .not("current_jd_version_id", "is", null)
    .maybeSingle();
  return Boolean(data);
}

/**
 * FR-95. Checked in step 1 *before* a signed URL is issued, so a repeat
 * applicant never uploads a megabyte only to be refused afterwards, and
 * again in step 3 because the two calls are not atomic. The unique
 * constraint on (opening_id, candidate_id) is the final backstop.
 */
export async function hasExistingApplication(
  organizationId: string,
  openingId: string,
  email: string,
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: candidate } = await admin
    .from("candidate")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .maybeSingle();

  if (!candidate) return false;

  const { data: application } = await admin
    .from("application")
    .select("id")
    .eq("opening_id", openingId)
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  return Boolean(application);
}

/** Objects land here until a submission claims them (tech spec §5.2, §5.4). */
export function pendingCvPath(
  organizationId: string,
  token: string,
  filename: string,
): string {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-100);
  return `${organizationId}/apply/${token}/${randomUUID()}-${safe}`;
}

/**
 * The only authoritative statement about what was actually uploaded.
 * The browser could claim any path, any size, any type — this asks
 * Storage instead of believing it.
 */
export async function verifyUploadedObject(
  path: string,
  organizationId: string,
  token: string,
): Promise<{ ok: true; size: number; mime: string } | { ok: false; reason: string }> {
  // Confine the claim to this posting's own pending folder before we
  // even look: otherwise a crafted path could point at another
  // organisation's storage and have its metadata read back.
  const expectedPrefix = `${organizationId}/apply/${token}/`;
  if (!path.startsWith(expectedPrefix) || path.includes("..")) {
    return { ok: false, reason: "That upload doesn't belong to this application." };
  }

  const admin = createAdminClient();
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);

  const { data } = await admin.storage.from(CV_BUCKET).list(folder, {
    search: name,
    limit: 1,
  });

  const object = data?.find((o) => o.name === name);
  if (!object) {
    return { ok: false, reason: "We couldn't find your uploaded CV. Please try again." };
  }

  const size = (object.metadata?.size as number | undefined) ?? 0;
  const mime = (object.metadata?.mimetype as string | undefined) ?? "";
  return { ok: true, size, mime };
}

/**
 * Rate limiting for the public endpoints (§5.3). IPs are hashed rather
 * than stored: it is enough to recognise a repeat caller, and Principle 9
 * says collect the minimum.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

const RATE_WINDOW_MINUTES = 60;
const RATE_MAX_ATTEMPTS = 12;

/**
 * Deliberately loose. Tech spec §17: a limit that blocks a real
 * applicant is worse than one that lets junk reach a human queue.
 */
export async function checkRateLimit(
  postingId: string,
  ipHash: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();

  const { count } = await admin
    .from("apply_attempt")
    .select("id", { count: "exact", head: true })
    .eq("posting_id", postingId)
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  return (count ?? 0) < RATE_MAX_ATTEMPTS;
}

export async function recordAttempt(postingId: string, ipHash: string) {
  const admin = createAdminClient();
  await admin.from("apply_attempt").insert({ posting_id: postingId, ip_hash: ipHash });
}
