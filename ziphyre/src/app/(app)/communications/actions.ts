"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/queue";
import { runQueuedJobs } from "@/lib/jobs/runner";
import {
  restoreTemplateDefault,
  saveTemplate,
  unknownVariables,
} from "@/lib/mail/template-admin";
import type { MessageKind } from "@/lib/mail/templates";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * FR-126 to FR-129. Saving inserts a new version; restoring inserts the
 * code default as one. Neither can overwrite, because
 * `message_template` has no update policy — see `template-admin.ts`.
 */
export async function saveMessageTemplate(input: {
  kind: MessageKind;
  subject: string;
  body: string;
}): Promise<ActionResult<{ version: number }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  // FR-127, checked here as well as in the browser: the client-side
  // warning is a courtesy, this is the rule.
  const unknown = unknownVariables(input.subject, input.body);
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown
        .map((v) => `{{${v}}}`)
        .join(", ")}. These would be emailed as written.`,
    };
  }

  const result = await saveTemplate({
    organizationId: session.organization.id,
    userId: session.userId,
    kind: input.kind,
    subject: input.subject,
    body: input.body,
  });
  if (!result.ok) return result;

  revalidatePath("/communications");
  return { ok: true, data: { version: result.version } };
}

/** FR-128, in one action. */
export async function restoreMessageTemplate(
  kind: MessageKind,
): Promise<ActionResult<{ version: number }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const result = await restoreTemplateDefault({
    organizationId: session.organization.id,
    userId: session.userId,
    kind,
  });
  if (!result.ok) return result;

  revalidatePath("/communications");
  return { ok: true, data: { version: result.version } };
}

/**
 * FR-111's retry. A failed message is put back on the queue rather than
 * re-composed: the rendered subject and body already on the row are what
 * the admin decided to send, and re-rendering could quietly change the
 * words if a template moved underneath.
 *
 * The admin client writes here because `message` has no update policy
 * from the browser (§10A.2) — rows are written by the send path and
 * updated by the job runner. The membership check is therefore this
 * function's own job, and the `organization_id` filter is what stops a
 * guessed id reaching another tenant's outbox.
 */
export async function retryMessage(messageId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();

  const { data: message, error: readError } = await admin
    .from("message")
    .select("id, status, to_email")
    .eq("id", messageId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!message) return { ok: false, error: "That message no longer exists." };

  // Only a failure is retryable. Retrying a sent message would send a
  // second copy to a real person, and `queued` is already on its way.
  if (message.status === "sent") {
    return { ok: false, error: "That message was already sent." };
  }
  if (message.status === "queued") {
    return { ok: false, error: "That message is already queued to send." };
  }
  // A purged message has no address and no body left (§10A.5). There is
  // nothing to send, and inventing a replacement would be worse.
  if (message.to_email === "") {
    return {
      ok: false,
      error: "This message's details were deleted under the retention policy.",
    };
  }

  const { error: updateError } = await admin
    .from("message")
    .update({ status: "queued", error: null })
    .eq("id", messageId)
    .eq("organization_id", session.organization.id);
  if (updateError) return { ok: false, error: updateError.message };

  try {
    await enqueueJob(session.organization.id, "send_message", { messageId });
  } catch (e) {
    // Put it back as failed rather than leaving a `queued` row with no
    // job behind it — a message that says "sending" forever is exactly
    // what FR-111 refuses.
    await admin
      .from("message")
      .update({
        status: "failed",
        error: `Couldn't queue the retry: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      })
      .eq("id", messageId);
    return { ok: false, error: "Couldn't queue the retry. Please try again." };
  }

  after(() => {
    runQueuedJobs({ kinds: ["send_message"] }).catch(() => {});
  });

  revalidatePath("/communications");
  return { ok: true, data: undefined };
}
