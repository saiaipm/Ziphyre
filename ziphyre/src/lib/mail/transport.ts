import "server-only";
import nodemailer from "nodemailer";

/**
 * Tech spec §10A.1 — the one place mail leaves Ziphyre.
 *
 * **SMTP with an app password, deliberately not the Gmail API.**
 * `gmail.send` is a restricted OAuth scope, and PN-002 established that
 * a single sensitive scope puts Ziphyre's whole consent screen behind
 * Google's verification review — admin sign-in included, not just the
 * feature that asked. To Google, SMTP with an app password is a mail
 * client: no consent screen, no scopes, no review. **Do not "modernise"
 * this to the Gmail API without re-reading PN-002 first.**
 *
 * Everything above this file goes through `sendMail` and knows nothing
 * about Gmail. That matters because Gmail's limits are low — roughly
 * 500 recipients a day on a free account, ~2,000 on Workspace — so a
 * real provider replaces this the first time a customer runs a large
 * rejection sweep.
 */

export type OutboundMail = {
  fromEmail: string;
  fromName: string | null;
  /** FR-115. A candidate's reply must reach a person, never Ziphyre. */
  replyTo: string;
  to: string;
  subject: string;
  /** Plain text. No HTML, no tracking pixel — FR-112 means we do not
   *  claim to know about delivery, opens or clicks, so we do not embed
   *  the thing that would tell us. */
  text: string;
};

export type MailCredentials = {
  fromEmail: string;
  appPassword: string;
};

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

function buildTransport(creds: MailCredentials) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS upgrades the connection on 587.
    auth: { user: creds.fromEmail, pass: creds.appPassword },
  });
}

export async function sendMail(
  mail: OutboundMail,
  creds: MailCredentials,
): Promise<SendResult> {
  try {
    await buildTransport(creds).sendMail({
      from: mail.fromName
        ? { name: mail.fromName, address: mail.fromEmail }
        : mail.fromEmail,
      replyTo: mail.replyTo,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...describeFailure(e) };
  }
}

/**
 * FR-114. Proves the credentials before they are saved, so a wrong app
 * password is caught at the point of entry rather than discovered by a
 * candidate not receiving an email.
 */
export async function verifyCredentials(
  creds: MailCredentials,
): Promise<SendResult> {
  try {
    await buildTransport(creds).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, ...describeFailure(e) };
  }
}

/**
 * Turns SMTP's terse failures into something an admin can act on, and
 * decides whether retrying could ever help.
 *
 * The split matters: the job runner retries with backoff, and retrying
 * a bad password forever produces a queue that never drains and a
 * customer who is never told what is wrong.
 */
function describeFailure(e: unknown): { error: string; retryable: boolean } {
  const raw = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : "";

  // 535 is Gmail's "username and password not accepted" — almost always
  // an app password that was never created, or 2-Step Verification not
  // switched on. No amount of retrying fixes either.
  if (raw.includes("535") || raw.includes("Username and Password not accepted")) {
    return {
      error:
        "Gmail rejected the address and app password. Check that 2-Step Verification is on and that this is an app password, not the account password.",
      retryable: false,
    };
  }
  if (raw.includes("Invalid login") || code === "EAUTH") {
    return { error: "Gmail rejected the sign-in.", retryable: false };
  }
  if (raw.includes("550") || raw.includes("Daily user sending limit")) {
    return {
      error:
        "Gmail's daily sending limit has been reached for this account. It resets after 24 hours.",
      retryable: true,
    };
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET") {
    return { error: "Couldn't reach Gmail. This is usually temporary.", retryable: true };
  }
  return { error: raw, retryable: true };
}
