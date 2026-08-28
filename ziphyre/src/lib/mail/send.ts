import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, keyHint } from "@/lib/crypto";
import { bufferToPgBytea, pgByteaToBuffer } from "@/lib/pg-bytea";
import { enqueueJob } from "@/lib/jobs/queue";
import { sendMail, verifyCredentials, type MailCredentials } from "./transport";
import {
  DEFAULT_TEMPLATES,
  render,
  type MessageKind,
  type TemplateVars,
} from "./templates";

/**
 * Composing and queueing outbound mail — tech spec §10A.3.
 *
 * **A `message` row is written before any job runs.** The outbox must
 * never have a gap between "the admin clicked send" and "something
 * happened": a queued row that later fails is visible and retryable,
 * where a job with no row is invisible if the enqueue itself fails.
 */

export type MailSettings = {
  fromEmail: string;
  fromName: string | null;
  passwordHint: string | null;
  verifiedAt: string | null;
  bookingUrl: string | null;
};

export async function getMailSettings(
  organizationId: string,
): Promise<MailSettings | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mail_settings")
    // Never selects app_password_encrypted — the same rule the provider
    // settings follow. A secret that is not read cannot be leaked.
    .select("from_email, from_name, password_hint, verified_at, booking_url")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  return {
    fromEmail: data.from_email,
    fromName: data.from_name,
    passwordHint: data.password_hint,
    verifiedAt: data.verified_at,
    bookingUrl: data.booking_url,
  };
}

/** FR-114: proven before it is stored, never after. */
export async function saveMailSettings(input: {
  organizationId: string;
  fromEmail: string;
  fromName: string | null;
  appPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Gmail shows app passwords in groups of four; people paste the
  // spaces along with them and SMTP rejects it with a bare 535.
  const appPassword = input.appPassword.replace(/\s+/g, "");

  const check = await verifyCredentials({
    fromEmail: input.fromEmail,
    appPassword,
  });
  if (!check.ok) return { ok: false, error: check.error };

  const admin = createAdminClient();
  const { error } = await admin.from("mail_settings").upsert(
    {
      organization_id: input.organizationId,
      from_email: input.fromEmail,
      from_name: input.fromName,
      app_password_encrypted: bufferToPgBytea(encryptSecret(appPassword)),
      password_hint: keyHint(appPassword),
      verified_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function loadCredentials(
  organizationId: string,
): Promise<MailCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mail_settings")
    .select("from_email, app_password_encrypted")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data?.app_password_encrypted) return null;
  return {
    fromEmail: data.from_email,
    appPassword: decryptSecret(pgByteaToBuffer(data.app_password_encrypted)),
  };
}

/** The active template — the customer's latest version, else the default. */
export async function getTemplate(
  organizationId: string,
  kind: MessageKind,
): Promise<{ subject: string; body: string; templateId: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("message_template")
    .select("id, subject, body")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) return { subject: data.subject, body: data.body, templateId: data.id };
  return { ...DEFAULT_TEMPLATES[kind], templateId: null };
}

export function statusUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${base}/status/${token}`;
}

/**
 * Renders one message, writes it to the outbox as `queued`, and queues
 * a job to deliver it. **One row and one job per recipient** (FR-111):
 * a failure has to be attributable to the candidate it was meant for,
 * and per-recipient jobs inherit the runner's existing backoff.
 */
export async function queueMessage(input: {
  organizationId: string;
  applicationId: string;
  kind: MessageKind;
  toEmail: string;
  vars: Partial<TemplateVars>;
  sentBy: string | null;
  /** Overrides for a one-off edit before sending; falls back to the template. */
  override?: { subject: string; body: string };
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const template = input.override
    ? { ...input.override, templateId: null }
    : await getTemplate(input.organizationId, input.kind);

  const subject = render(template.subject, input.vars);
  const body = render(template.body, input.vars);

  const { data, error } = await admin
    .from("message")
    .insert({
      organization_id: input.organizationId,
      application_id: input.applicationId,
      template_id: template.templateId,
      kind: input.kind,
      to_email: input.toEmail,
      // Stored rendered, not as a template pointer — FR-129.
      subject,
      body,
      status: "queued",
      sent_by: input.sentBy,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await enqueueJob(input.organizationId, "send_message", {
    messageId: data.id,
  });
  return { ok: true, messageId: data.id };
}

/**
 * The job body. Throws on a retryable failure so the runner backs off;
 * marks the row `failed` and returns on one that retrying cannot fix,
 * because a queue that never drains tells the admin nothing.
 */
export async function deliverMessage(
  organizationId: string,
  messageId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: message } = await admin
    .from("message")
    .select("id, application_id, kind, to_email, subject, body, status")
    .eq("id", messageId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!message) throw new Error(`message ${messageId} not found`);
  // Idempotent: a retry after a partial failure must not send twice.
  if (message.status === "sent") return;

  const settings = await getMailSettings(organizationId);
  const creds = await loadCredentials(organizationId);
  if (!settings || !creds) {
    await fail(admin, messageId, "No sending address is configured.");
    return;
  }

  const result = await sendMail(
    {
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      // FR-115. A reply reaches a person, never Ziphyre.
      replyTo: settings.fromEmail,
      to: message.to_email,
      subject: message.subject,
      text: message.body,
    },
    creds,
  );

  if (!result.ok) {
    if (result.retryable) throw new Error(result.error);
    await fail(admin, messageId, result.error);
    return;
  }

  await admin
    .from("message")
    .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
    .eq("id", messageId);

  // FR-123's gate. Set only once the outcome has genuinely been sent,
  // which is what lets the status page reveal a rejection without ever
  // telling a candidate something nobody chose to tell them.
  if (message.kind === "outcome_rejected") {
    await admin
      .from("application")
      .update({ outcome_sent_at: new Date().toISOString() })
      .eq("id", message.application_id)
      .is("outcome_sent_at", null);
  }
}

async function fail(
  admin: ReturnType<typeof createAdminClient>,
  messageId: string,
  error: string,
): Promise<void> {
  await admin
    .from("message")
    .update({ status: "failed", error })
    .eq("id", messageId);
}

/** Terminal-failure hook for the runner — tech spec §7's failure table. */
export async function markMessageFailed(
  organizationId: string,
  messageId: string,
  error: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("message")
    .update({ status: "failed", error })
    .eq("id", messageId)
    .eq("organization_id", organizationId);
}
