import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getMailSettings } from "@/lib/mail/send";
import { getOutbox } from "@/lib/mail/outbox";
import {
  getAllTemplatesForEditing,
  getPreviewVars,
} from "@/lib/mail/template-admin";
import { MESSAGE_KINDS } from "@/lib/mail/templates";
import { SenderForm } from "../settings/communications/sender-form";
import { OutboxTable } from "./outbox-table";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Communications" };

/**
 * FR-133 and FR-134. The outbox and the configuration behind it, on one
 * page — but **sending itself is not here**, and that is deliberate:
 * FR-134 keeps it in the pipeline, because the decision to contact a
 * candidate is made while looking at them, not while looking at a list
 * of mail.
 *
 * FR-135: outbound only. No inbox, no threads, no replies (Non-Goal 10).
 */
export default async function CommunicationsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  const settings = await getMailSettings(session.organization.id);
  const [outbox, templates, previewVars] = await Promise.all([
    getOutbox(),
    getAllTemplatesForEditing(MESSAGE_KINDS),
    getPreviewVars(session.organization.name, settings?.bookingUrl ?? null),
  ]);

  const failed = outbox.filter((m) => m.status === "failed").length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">
          Communications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every message Ziphyre has sent on your behalf. Nothing goes out
          unless you send it — except the confirmation a candidate gets when
          they apply.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Outbox</h2>
          <p className="text-sm text-muted-foreground">
            {/* FR-112. "Sent" is the honest word: it means the mail server
                accepted it, not that anyone read it. */}
            {failed > 0
              ? `${failed} failed — they can be sent again.`
              : "Sent means accepted by the mail server, not opened."}
          </p>
        </div>
        <OutboxTable rows={outbox} />
      </section>

      <section className="space-y-3 border-t border-divider pt-8">
        <div>
          <h2 className="text-sm font-semibold">Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The wording candidates receive. Saving keeps every earlier
            version, and never changes a message already sent.
          </p>
        </div>
        <TemplateEditor
          templates={templates}
          previewVars={previewVars}
          bookingLinkSet={Boolean(previewVars.bookingLink)}
        />
      </section>

      <section className="space-y-3 border-t border-divider pt-8">
        <h2 className="text-sm font-semibold">Sending identity</h2>
        <SenderForm settings={settings} />
      </section>
    </div>
  );
}
