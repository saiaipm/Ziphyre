import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MessageKind } from "./templates";

/**
 * The outbox — FR-133, and the place FR-111 is finally answered.
 *
 * **This is an outbound log, not an inbox** (FR-135, Non-Goal 10). No
 * threads, no replies, no read receipts. FR-112 draws the line the whole
 * page has to respect: Ziphyre reports what it *sent*, never what was
 * delivered or read. `status: sent` means the mail server accepted it —
 * nothing here knows whether anyone opened it, and nothing here should
 * ever imply otherwise.
 *
 * Read through the user's own client, so RLS scopes it to the
 * organisation.
 */

export type OutboxRow = {
  id: string;
  kind: MessageKind;
  status: "queued" | "sent" | "failed";
  error: string | null;
  toEmail: string;
  subject: string;
  sentAt: string | null;
  createdAt: string;
  candidateName: string | null;
  roleTitle: string | null;
  postingId: string | null;
  openingId: string | null;
  /** Null for the confirmation on apply — the one message no person chose. */
  sentByName: string | null;
  /** §10A.5 emptied the address and text. What was said is gone by design. */
  purged: boolean;
};

export async function getOutbox(limit = 200): Promise<OutboxRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("message")
    .select(
      `id, kind, status, error, to_email, subject, sent_at, created_at,
       sender:sent_by (display_name, email),
       application:application_id (
         candidate:candidate_id (full_name),
         opening:opening_id (id, title, posting_id)
       )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const application = row.application as unknown as {
      candidate: { full_name: string | null } | null;
      opening: { id: string; title: string; posting_id: string } | null;
    } | null;
    const sender = row.sender as unknown as {
      display_name: string | null;
      email: string;
    } | null;

    return {
      id: row.id,
      kind: row.kind as MessageKind,
      status: row.status as OutboxRow["status"],
      error: row.error,
      toEmail: row.to_email,
      subject: row.subject,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      candidateName: application?.candidate?.full_name ?? null,
      roleTitle: application?.opening?.title ?? null,
      postingId: application?.opening?.posting_id ?? null,
      openingId: application?.opening?.id ?? null,
      sentByName: sender ? (sender.display_name ?? sender.email) : null,
      // The purge empties `to_email`, `subject` and `body` and keeps
      // `kind`, `status` and `sent_at` — so a purged row still accounts
      // for the fact that something was sent without saying what, to
      // whom. Recognised by the emptied address rather than a flag,
      // because that is the column the purge actually clears.
      purged: row.to_email === "",
    };
  });
}
