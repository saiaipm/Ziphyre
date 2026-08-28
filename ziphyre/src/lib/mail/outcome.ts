import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMailSettings, getTemplate, queueMessage, statusUrl } from "./send";
import { render, type MessageKind } from "./templates";
import { isEligible, type OfferKind, type OutcomeRecipient } from "./offer";

// Re-exported so callers reach one name for these, not two.
export { isEligible };
export type { OfferKind, OutcomeRecipient };

const TEMPLATE_FOR: Record<OfferKind, MessageKind> = {
  reject: "outcome_rejected",
  reversal: "outcome_reversed",
  invite: "interview_invite",
};

/**
 * The outcome message offered when rejecting (FR-110), and the update
 * offered when that rejection is reversed.
 *
 * **This is the only place a stage change causes an email, and it does
 * so only because a person ticked a box in the same action.** FR-109 is
 * absolute: nothing but the application-received message (FR-117) sends
 * itself. Read this file as the offer, never as an automation — if a
 * future change makes `sendOutcome` default to true somewhere, that
 * requirement is what it has broken.
 *
 * Recipients are re-read here through the **user's own client**, so RLS
 * decides who is emailable, exactly as the export does (§FR-71). The
 * browser sends ids; it never sends addresses.
 */

export type OutcomeSendPreview = {
  /** FR-116. False means the offer is replaced by the way to fix it. */
  configured: boolean;
  fromEmail: string | null;
  recipients: OutcomeRecipient[];
  /** The rendered message, for a single recipient only. Seeing the words
   *  before sending them is worth more than any count. */
  sample: { subject: string; body: string } | null;
};

type RecipientRow = {
  id: string;
  /** Nullable since the purge nulls it (§10A.5) — a purged application
   *  has no status page left to link to. */
  status_token: string | null;
  outcome_sent_at: string | null;
  candidate: { full_name: string | null; email: string | null } | null;
  opening: { title: string; booking_url: string | null } | null;
};

async function loadRecipientRows(
  applicationIds: string[],
): Promise<RecipientRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application")
    .select(
      `id, status_token, outcome_sent_at,
       candidate:candidate_id (full_name, email),
       opening:opening_id (title, booking_url)`,
    )
    .in("id", applicationIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RecipientRow[];
}

/**
 * Manual upload mints `manual+<uuid>@ziphyre.internal` because
 * `candidate.email` is not-null unique. It is plumbing, not a way to
 * reach anyone, and mailing it would bounce into the sending account's
 * own reputation. Same rule as `getApplicationsForOpening`.
 */
function realEmail(email: string | null | undefined): string | null {
  return email && !email.endsWith("@ziphyre.internal") ? email : null;
}

function toRecipient(
  row: RecipientRow,
  orgBookingUrl: string | null,
): OutcomeRecipient {
  return {
    applicationId: row.id,
    candidateName: row.candidate?.full_name ?? "This candidate",
    email: realEmail(row.candidate?.email),
    alreadySent: row.outcome_sent_at !== null,
    // FR-131: the opening's own link wins, because a role scheduled by
    // someone else needs their calendar, not the organisation's.
    bookingLink: row.opening?.booking_url ?? orgBookingUrl ?? null,
  };
}

/** Everything the reject dialog needs to make an honest offer. */
export async function getOutcomeSendPreview(
  organizationId: string,
  organisationName: string,
  applicationIds: string[],
  kind: OfferKind = "reject",
): Promise<OutcomeSendPreview> {
  const settings = await getMailSettings(organizationId);
  // FR-114 stores `verified_at` only after the credentials authenticated,
  // so an unverified row is a half-finished setup, not a usable sender.
  const configured = Boolean(settings?.verifiedAt);

  const rows = await loadRecipientRows(applicationIds);
  const recipients = rows.map((r) => toRecipient(r, settings?.bookingUrl ?? null));

  let sample: OutcomeSendPreview["sample"] = null;
  const only = rows.length === 1 ? rows[0] : null;
  if (only && realEmail(only.candidate?.email)) {
    const template = await getTemplate(organizationId, TEMPLATE_FOR[kind]);
    const vars = {
      candidateName: only.candidate?.full_name ?? "there",
      roleTitle: only.opening?.title ?? "the role",
      organisationName,
      statusLink: only.status_token ? statusUrl(only.status_token) : "",
      bookingLink:
        only.opening?.booking_url ?? settings?.bookingUrl ?? "",
    };
    sample = {
      subject: render(template.subject, vars),
      body: render(template.body, vars),
    };
  }

  return {
    configured,
    fromEmail: settings?.fromEmail ?? null,
    recipients,
    sample,
  };
}

export type OutcomeSendResult = {
  queued: number;
  /** Named so the caller can say who was skipped and why, not just how many. */
  noEmail: string[];
  alreadySent: string[];
  failed: string[];
};

/**
 * Queues one outcome message per application that can actually receive
 * one. Called only with ids that genuinely moved to Rejected — a message
 * about a decision that did not get recorded is worse than no message.
 *
 * Never throws: the move has already happened by the time this runs, and
 * a mail failure must not read to the caller as a failed rejection.
 * Everything it could not do comes back named.
 */
export async function queueOutcomeMessages(input: {
  organizationId: string;
  organisationName: string;
  applicationIds: string[];
  sentBy: string;
  kind?: OfferKind;
}): Promise<OutcomeSendResult> {
  const kind: OfferKind = input.kind ?? "reject";
  const result: OutcomeSendResult = {
    queued: 0,
    noEmail: [],
    alreadySent: [],
    failed: [],
  };
  if (input.applicationIds.length === 0) return result;

  const orgBookingUrl =
    (await getMailSettings(input.organizationId))?.bookingUrl ?? null;

  let rows: RecipientRow[];
  try {
    rows = await loadRecipientRows(input.applicationIds);
  } catch {
    result.failed = input.applicationIds;
    return result;
  }

  for (const row of rows) {
    const name = row.candidate?.full_name ?? "This candidate";
    const email = realEmail(row.candidate?.email);

    if (!email) {
      result.noEmail.push(name);
      continue;
    }
    // Re-checked here rather than trusted from the preview: the dialog's
    // snapshot could be minutes old, and the cost of being wrong is a
    // second rejection email to someone already rejected — or, running
    // the other way, an "update" to someone who was never told anything.
    if (!isEligible(toRecipient(row, orgBookingUrl), kind)) {
      result.alreadySent.push(name);
      continue;
    }

    const queued = await queueMessage({
      organizationId: input.organizationId,
      applicationId: row.id,
      kind: TEMPLATE_FOR[kind],
      toEmail: email,
      vars: {
        candidateName: name,
        roleTitle: row.opening?.title ?? "the role",
        organisationName: input.organisationName,
        // FR-124: the same link they already have, never a new one.
        statusLink: row.status_token ? statusUrl(row.status_token) : "",
        // FR-130/131, resolved per application rather than per batch:
        // a batch can span openings with different links.
        bookingLink: row.opening?.booking_url ?? orgBookingUrl ?? "",
      },
      sentBy: input.sentBy,
    });

    if (queued.ok) result.queued += 1;
    else result.failed.push(name);
  }

  return result;
}
