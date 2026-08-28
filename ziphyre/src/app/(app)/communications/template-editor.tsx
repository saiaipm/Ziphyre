"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MESSAGE_KIND_LABELS,
  TEMPLATE_VARIABLES,
  render,
  usedVariables,
  type MessageKind,
} from "@/lib/mail/templates";
import type { StoredTemplate } from "@/lib/mail/template-admin";
import type { PreviewVars } from "@/lib/mail/template-admin";
import { saveMessageTemplate, restoreMessageTemplate } from "./actions";

/**
 * FR-126 to FR-129.
 *
 * `render` and the variable vocabulary are imported from `templates.ts`,
 * which is client-safe for exactly this reason: the preview here and the
 * message that actually leaves are produced by the same function. A
 * preview computed differently from the send is worse than no preview,
 * because it is believed.
 */

const KNOWN = new Set(TEMPLATE_VARIABLES.map((v) => v.key as string));

export function TemplateEditor({
  templates,
  previewVars,
  bookingLinkSet,
}: {
  templates: StoredTemplate[];
  previewVars: PreviewVars;
  bookingLinkSet: boolean;
}) {
  const [active, setActive] = useState<MessageKind>(templates[0]?.kind);
  const current = templates.find((t) => t.kind === active) ?? templates[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => setActive(t.kind)}
            aria-pressed={t.kind === active}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              t.kind === active
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {MESSAGE_KIND_LABELS[t.kind]}
            {t.version !== null && (
              <span className="ml-1.5 opacity-60">v{t.version}</span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <OneTemplate
          // Remounts on switch so the draft state belongs to one kind and
          // cannot leak into another — editing the rejection and clicking
          // to the invite must not carry the rejection's words across.
          key={current.kind}
          template={current}
          previewVars={previewVars}
          bookingLinkSet={bookingLinkSet}
        />
      )}
    </div>
  );
}

function OneTemplate({
  template,
  previewVars,
  bookingLinkSet,
}: {
  template: StoredTemplate;
  previewVars: PreviewVars;
  bookingLinkSet: boolean;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const dirty = subject !== template.subject || body !== template.body;

  const used = [...new Set([...usedVariables(subject), ...usedVariables(body)])];
  const unknown = used.filter((v) => !KNOWN.has(v));

  // FR-132. An invite whose booking link resolves to nothing is an
  // invitation to nowhere, and saying so here beats discovering it at
  // send time.
  const needsBookingLink =
    template.kind === "interview_invite" &&
    used.includes("bookingLink") &&
    !bookingLinkSet;

  async function onSave() {
    setSaving(true);
    const result = await saveMessageTemplate({ kind: template.kind, subject, body });
    setSaving(false);
    if (result.ok) {
      toast.success(`Saved as v${result.data.version}`, {
        description: "Earlier versions are kept — what was already sent is unchanged.",
      });
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  async function onRestore() {
    setRestoring(true);
    const result = await restoreMessageTemplate(template.kind);
    setRestoring(false);
    if (result.ok) {
      toast.success("Restored the default wording", {
        description: `Saved as v${result.data.version} — nothing was deleted.`,
      });
    } else {
      toast.error("Couldn't restore", { description: result.error });
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground">
          Subject
        </label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1.5"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground">
          Message
        </label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="mt-1.5 font-mono text-sm"
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          Variables you can use
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <span
              key={v.key}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                used.includes(v.key)
                  ? "border-fit-accent/50 bg-fit-accent/10"
                  : "border-border text-muted-foreground",
              )}
              title={v.label}
            >
              {`{{${v.key}}}`}
            </span>
          ))}
        </div>
        {/* Non-Goal 9, said out loud. A variable is a setting, and the
            absence of a score variable is the setting being refused. */}
        <p className="mt-1.5 text-xs text-muted-foreground">
          There is no score or assessment variable. Candidates never see
          either.
        </p>
      </div>

      {unknown.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-fit-weak">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {unknown.map((v) => `{{${v}}}`).join(", ")}{" "}
            {unknown.length > 1 ? "are not variables" : "is not a variable"} —
            it would be emailed exactly as written. Check the spelling.
          </span>
        </p>
      )}

      {needsBookingLink && (
        <p className="flex items-start gap-1.5 text-xs text-fit-review">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This uses the booking link, but none is set. An invite can&rsquo;t be
          sent without one.
        </p>
      )}

      <Preview subject={subject} body={body} vars={previewVars} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={restoring || saving}
          onClick={onRestore}
        >
          {restoring ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden />
          )}
          Restore default
        </Button>

        <div className="flex items-center gap-3">
          {template.version !== null && (
            <span className="text-xs text-muted-foreground">
              Currently v{template.version}
            </span>
          )}
          <Button disabled={!dirty || saving || unknown.length > 0} onClick={onSave}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Save new version
          </Button>
        </div>
      </div>
    </div>
  );
}

/** FR-126. Rendered with the same function the send path uses. */
function Preview({
  subject,
  body,
  vars,
}: {
  subject: string;
  body: string;
  vars: PreviewVars;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Preview{" "}
        <span className="font-normal">
          {vars.real
            ? `— filled in with ${vars.candidateName}'s details`
            : "— no applications yet, so these are sample values"}
        </span>
      </p>
      <p className="mt-2 text-sm font-medium">{render(subject, vars)}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
        {render(body, vars)}
      </p>
    </div>
  );
}
