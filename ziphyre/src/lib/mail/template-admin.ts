import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_TEMPLATES,
  usedVariables,
  TEMPLATE_VARIABLES,
  type MessageKind,
} from "./templates";
import { statusUrl } from "./send";

/**
 * Template editing — FR-126 to FR-129, tech spec §10A.7.
 *
 * Read through the user's own client so RLS scopes everything, and
 * **written the only way `message_template` allows**: it has an insert
 * policy and no update policy, so FR-129's "saving creates a new version
 * rather than overwriting" is enforced by the absence of the policy, the
 * same way `screening` and `jd_version` are. Nothing here could
 * overwrite a version even if it tried.
 */

export type StoredTemplate = {
  kind: MessageKind;
  subject: string;
  body: string;
  /** Null when nothing has been saved and the code default is in use. */
  version: number | null;
  savedAt: string | null;
};

export async function getTemplateForEditing(
  kind: MessageKind,
): Promise<StoredTemplate> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_template")
    .select("subject, body, version, created_at")
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { kind, ...DEFAULT_TEMPLATES[kind], version: null, savedAt: null };
  }
  return {
    kind,
    subject: data.subject,
    body: data.body,
    version: data.version,
    savedAt: data.created_at,
  };
}

export async function getAllTemplatesForEditing(
  kinds: readonly MessageKind[],
): Promise<StoredTemplate[]> {
  return Promise.all(kinds.map(getTemplateForEditing));
}

const KNOWN = new Set(TEMPLATE_VARIABLES.map((v) => v.key as string));

/**
 * FR-127's vocabulary, enforced before a save rather than at send time.
 *
 * `render()` deliberately leaves an unrecognised `{{token}}` as literal
 * text so a typo fails visibly instead of mailing a blank — but without
 * this check, "visibly" means visible to the *candidate*. A mistyped
 * `{{candidatename}}` reaching someone's inbox is what this prevents.
 */
export function unknownVariables(subject: string, body: string): string[] {
  return [
    ...new Set([...usedVariables(subject), ...usedVariables(body)]),
  ].filter((v) => !KNOWN.has(v));
}

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; error: string };

export async function saveTemplate(input: {
  organizationId: string;
  userId: string;
  kind: MessageKind;
  subject: string;
  body: string;
}): Promise<SaveResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { ok: false, error: "The subject can't be empty." };
  if (!body) return { ok: false, error: "The message can't be empty." };

  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("message_template")
    .select("version")
    .eq("kind", input.kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (latest?.version ?? 0) + 1;

  const { error } = await supabase.from("message_template").insert({
    organization_id: input.organizationId,
    kind: input.kind,
    version,
    subject,
    body,
    created_by: input.userId,
  });

  if (error) {
    // Two admins saving at the same moment compute the same next version
    // and the unique constraint rejects the loser. That is the correct
    // outcome; what matters is that it reads as what happened rather
    // than as a database error.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Someone else saved a new version just now. Reload and reapply your changes.",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, version };
}

/**
 * FR-128, done the only way append-only allows: the default is saved as
 * a **new version**, never by deleting the ones above it.
 *
 * Deleting is not available and should not be made available —
 * `message.template_id` references these rows, so removing a version
 * would break the record of which wording produced a message a real
 * person received. One more row costs nothing; FR-129's promise does.
 */
export async function restoreTemplateDefault(input: {
  organizationId: string;
  userId: string;
  kind: MessageKind;
}): Promise<SaveResult> {
  return saveTemplate({ ...input, ...DEFAULT_TEMPLATES[input.kind] });
}

export type PreviewVars = {
  candidateName: string;
  roleTitle: string;
  organisationName: string;
  bookingLink: string;
  statusLink: string;
  /** False when there is no application yet and the values are samples. */
  real: boolean;
};

/**
 * FR-126's "preview it filled with a real candidate's values".
 *
 * Non-Goal 9 is safe here by construction rather than by care: the
 * vocabulary has no score, component, assessment or disposition entry,
 * so there is nothing for a preview to leak no matter which application
 * it reads.
 */
export async function getPreviewVars(
  organisationName: string,
  bookingUrl: string | null,
): Promise<PreviewVars> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("application")
    .select(
      `status_token,
       candidate:candidate_id (full_name),
       opening:opening_id (title, booking_url)`,
    )
    .not("status_token", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sample = Object.fromEntries(
    TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]),
  ) as Record<string, string>;

  if (!data) {
    return {
      candidateName: sample.candidateName,
      roleTitle: sample.roleTitle,
      organisationName,
      bookingLink: bookingUrl ?? sample.bookingLink,
      statusLink: sample.statusLink,
      real: false,
    };
  }

  const candidate = data.candidate as unknown as {
    full_name: string | null;
  } | null;
  const opening = data.opening as unknown as {
    title: string;
    booking_url: string | null;
  } | null;

  return {
    candidateName: candidate?.full_name ?? sample.candidateName,
    roleTitle: opening?.title ?? sample.roleTitle,
    organisationName,
    // FR-131: the opening's own link wins over the organisation's.
    bookingLink: opening?.booking_url ?? bookingUrl ?? "",
    statusLink: data.status_token ? statusUrl(data.status_token) : "",
    real: true,
  };
}
