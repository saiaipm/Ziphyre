"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApplicationFieldsSchema,
  RELOCATION_OPTIONS,
  cvFileError,
} from "@/lib/apply/schema";
import { cn } from "@/lib/utils";

type Opening = {
  id: string;
  title: string;
  workLocation: string;
  jdContent: string;
  jdVersion: number;
};
type Errors = Record<string, string>;

/** Same pattern as the admin's `JdCard` export — what screening actually
 *  ran against, not the original upload, which is never stored. */
function downloadJd(opening: Opening) {
  const blob = new Blob([opening.jdContent], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opening.title.replace(/[^\w-]+/g, "-")}-job-description.md`;
  a.click();
  URL.revokeObjectURL(url);
}

const CV_BUCKET = "cvs";

export function ApplyForm({
  token,
  organizationName,
  openings,
}: {
  token: string;
  organizationName: string;
  openings: Opening[];
}) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [openingId, setOpeningId] = useState(
    openings.length === 1 ? openings[0].id : "",
  );
  /**
   * Which JDs are expanded, independent of which role is selected — a
   * candidate deciding between two roles wants to read both before
   * picking either, so this is not tied to `openingId`.
   */
  const [expandedJds, setExpandedJds] = useState<Set<string>>(
    // A single opening has nothing to decide between, so its JD opens
    // by default rather than costing an extra click.
    new Set(openings.length === 1 ? [openings[0].id] : []),
  );

  function toggleJd(id: string) {
    setExpandedJds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-8 text-center">
        <CheckCircle2
          className="mx-auto size-8 text-fit-strong"
          aria-hidden
        />
        <h2 className="mt-3 text-lg font-semibold">Application received</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Thanks — your application has gone to {organizationName}.
        </p>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const raw = {
      openingId,
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      currentLocation: String(form.get("currentLocation") ?? ""),
      experienceYears: String(form.get("experienceYears") ?? ""),
      experienceMonths: String(form.get("experienceMonths") ?? ""),
      willingnessToRelocate: String(form.get("willingnessToRelocate") ?? ""),
      noticePeriod: String(form.get("noticePeriod") ?? ""),
      currentCtc: String(form.get("currentCtc") ?? ""),
      expectedCtc: String(form.get("expectedCtc") ?? ""),
    };

    const parsed = ApplicationFieldsSchema.safeParse(raw);
    const nextErrors: Errors = {};
    if (!parsed.success) {
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (messages?.[0]) nextErrors[key] = messages[0];
      }
    }

    // FR-91: the CV is as required as any other field.
    if (!file) {
      nextErrors.cv = "Please attach your CV.";
    } else {
      const fileError = cvFileError(file);
      if (fileError) nextErrors.cv = fileError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsed.success || !file) return;

    setBusy(true);
    try {
      // Step 1 — ask for a slot. Every refusal happens here, before the
      // file moves (tech spec §5.2).
      const slotResponse = await fetch(`/api/apply/${token}/upload-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingId: parsed.data.openingId,
          email: parsed.data.email,
          filename: file.name,
          size: file.size,
          mime: file.type,
        }),
      });
      const slot = await slotResponse.json().catch(() => ({}));

      if (!slotResponse.ok) {
        setBusy(false);
        if (slot.error === "already_applied") {
          setFormError(slot.message);
        } else {
          setFormError(slot.message ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Step 2 — straight to Storage. The file never passes through the
      // application server.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(CV_BUCKET)
        .uploadToSignedUrl(slot.path, slot.token, file, {
          contentType: file.type,
        });

      if (uploadError) {
        setBusy(false);
        setFormError("Your CV didn't upload. Please check your connection and try again.");
        return;
      }

      // Step 3 — submit. The server verifies the object itself.
      const submitResponse = await fetch(`/api/apply/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          storagePath: slot.path,
          website: String(form.get("website") ?? ""),
        }),
      });

      if (!submitResponse.ok) {
        const body = await submitResponse.json().catch(() => ({}));
        setBusy(false);
        setFormError(body.message ?? "Something went wrong. Please try again.");
        return;
      }

      setSubmitted(true);
    } catch {
      setBusy(false);
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">Every question is required.</p>

      <Field label="Which role are you applying for?" error={errors.openingId}>
        <div className="space-y-2">
          {openings.map((o) => {
            const open = expandedJds.has(o.id);
            return (
              <div
                key={o.id}
                className={cn(
                  "overflow-hidden rounded-lg border transition-colors",
                  openingId === o.id
                    ? "border-primary bg-muted/50"
                    : "border-border hover:bg-muted/30",
                )}
              >
                <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                  <input
                    type="radio"
                    name="openingId"
                    value={o.id}
                    checked={openingId === o.id}
                    onChange={() => setOpeningId(o.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {o.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {o.workLocation}
                    </span>
                  </span>
                </label>

                {/* Reading the JD before deciding which role to apply
                    for is the ordinary path — this is why it sits under
                    each option rather than only under the one selected. */}
                <button
                  type="button"
                  onClick={() => toggleJd(o.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 border-t border-border/60 px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                  {open ? "Hide job description" : "View job description"}
                </button>

                {open && (
                  <div className="border-t border-border/60 bg-background px-4 py-3">
                    <div className="max-h-64 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {o.jdContent}
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadJd(o)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Download className="size-3.5" aria-hidden />
                      Download job description
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="Full name" error={errors.fullName}>
        <Input name="fullName" autoComplete="name" />
      </Field>

      <Field label="Email" error={errors.email}>
        <Input name="email" type="email" inputMode="email" autoComplete="email" />
      </Field>

      <Field label="Current location" error={errors.currentLocation}>
        <Input name="currentLocation" autoComplete="address-level2" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Years of work experience" error={errors.experienceYears}>
          <Input name="experienceYears" type="number" inputMode="numeric" min={0} />
        </Field>
        <Field label="Additional months (0–11)" error={errors.experienceMonths}>
          <Input
            name="experienceMonths"
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
          />
        </Field>
      </div>

      <Field
        label="Are you willing to relocate?"
        error={errors.willingnessToRelocate}
      >
        <div className="flex flex-wrap gap-2">
          {RELOCATION_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30 has-checked:border-primary has-checked:bg-muted/50"
            >
              <input type="radio" name="willingnessToRelocate" value={option} />
              {option}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Notice period" error={errors.noticePeriod}>
        <Input name="noticePeriod" placeholder="e.g. 1 month" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Current CTC (LPA)" error={errors.currentCtc}>
          <Input name="currentCtc" inputMode="decimal" />
        </Field>
        <Field label="Expected CTC (LPA)" error={errors.expectedCtc}>
          <Input name="expectedCtc" inputMode="decimal" />
        </Field>
      </div>

      <Field label="Your CV" error={errors.cv}>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          PDF or Word (.docx), up to 1 MB.
        </p>
      </Field>

      {/* Honeypot — off-screen, not display:none, so bots that skip
          hidden fields still fill it. Never shown to a real person. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {formError && (
        <p className="rounded-md border border-amber-200 bg-fit-review-bg px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:text-amber-100">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Submitting…
          </>
        ) : (
          "Submit application"
        )}
      </Button>

      {/* FR-97. The retention figure matches TechDecisions §8. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {organizationName} will use what you share here to consider you for this
        role. Your details are kept for six months after the role closes, and
        then deleted.
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {/* An error the candidate has to act on, in the colour errors use
          — it was slate, which read as a hint rather than a problem. */}
      {error && <p className="text-xs text-fit-weak">{error}</p>}
    </div>
  );
}
