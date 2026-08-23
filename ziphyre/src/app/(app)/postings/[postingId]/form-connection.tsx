"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listGoogleForms, connectFormToPosting, importNow } from "../actions";
import type { FormSummary, MatchReport } from "@/lib/google/forms";

export function FormConnection({
  postingId,
  openingOptions,
  googleConnected,
  connectedFormId,
  lastImportAt,
}: {
  postingId: string;
  openingOptions: string[];
  googleConnected: boolean;
  connectedFormId: string | null;
  lastImportAt: string | null;
}) {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [selectedForm, setSelectedForm] = useState<string | null>(
    connectedFormId,
  );
  const [report, setReport] = useState<MatchReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadForms() {
    setBusy(true);
    const result = await listGoogleForms();
    setBusy(false);
    if (!result.ok) {
      toast.error("Couldn't list your forms", { description: result.error });
      return;
    }
    setForms(result.data);
    if (result.data.length === 0) {
      toast.info("No Google Forms found on that account");
    }
  }

  async function onConnect() {
    if (!selectedForm) return;
    setBusy(true);
    const result = await connectFormToPosting({
      postingId,
      formId: selectedForm,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error("Couldn't connect that form", { description: result.error });
      return;
    }
    setReport(result.data);
    toast.success(
      result.data.matched
        ? "Your form's openings match this posting."
        : "Form connected, with mismatches to review",
    );
  }

  async function onImportNow() {
    setBusy(true);
    const result = await importNow(postingId);
    setBusy(false);
    if (result.ok) {
      toast.success("Checking for new responses…");
    } else {
      toast.error("Couldn't start the import", { description: result.error });
    }
  }

  function copyOptions() {
    void navigator.clipboard.writeText(openingOptions.join("\n"));
    toast.success("Copied");
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">Connect your application form</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ziphyre reads responses from your form&rsquo;s linked sheet. It never
          edits your form or your responses.
        </p>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Steps 1 and 2 are deliberately NOT gated on the Google
            connection: you build the form before you connect it, so
            hiding the option list until after connecting puts it behind
            the step that needs it. Only the picker below needs Google. */}
        <div>
          <p className="text-sm font-medium">
            1. Copy our template into your Google account.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            See <code>docs/google-form-setup.md</code> for the exact questions
            and settings.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium">
            2. Add your openings to the form&rsquo;s &ldquo;Role applied
            for&rdquo; dropdown.
          </p>
          <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label-meta mb-1">
                  Copy these, exactly as written
                </p>
                <ul className="space-y-0.5">
                  {openingOptions.map((o) => (
                    <li key={o} className="font-mono text-xs">
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="sm" variant="outline" onClick={copyOptions}>
                <Copy className="size-3.5" aria-hidden />
                Copy
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            3. Come back and pick your form below.
          </p>
          {!googleConnected ? (
            <p className="text-sm text-muted-foreground">
              Connect a Google account in Settings &rarr; Connections first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {forms === null ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadForms}
                    disabled={busy}
                  >
                    {busy ? "Loading…" : "Choose your form"}
                  </Button>
                ) : (
                  <>
                    <Select
                      value={selectedForm ?? undefined}
                      onValueChange={setSelectedForm}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Choose your form" />
                      </SelectTrigger>
                      <SelectContent>
                        {forms.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={onConnect}
                      disabled={busy || !selectedForm}
                    >
                      {busy ? "Connecting…" : "Connect form"}
                    </Button>
                  </>
                )}

                {connectedFormId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onImportNow}
                    disabled={busy}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Check for responses now
                  </Button>
                )}
              </div>

              {connectedFormId && lastImportAt && (
                <p className="text-xs text-muted-foreground">
                  Last checked {new Date(lastImportAt).toLocaleString()}.
                  Responses are picked up automatically every minute.
                </p>
              )}
            </>
          )}
        </div>

        {report && <MatchResult report={report} />}
      </div>
    </section>
  );
}

function MatchResult({ report }: { report: MatchReport }) {
  if (report.matched) {
    return (
      <p className="flex items-center gap-2 text-sm text-fit-strong">
        <Check className="size-4" aria-hidden />
        Your form&rsquo;s openings match this posting.
      </p>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-4 py-3 dark:border-amber-900/40">
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-fit-review"
        aria-hidden
      />
      <div className="space-y-1.5 text-sm text-amber-900 dark:text-amber-100">
        {report.optionsWithoutOpening.length > 0 && (
          <p>
            These openings are in your form but not in this posting:{" "}
            <strong>{report.optionsWithoutOpening.join(", ")}</strong>.
            Applications naming them will need assigning by hand.
          </p>
        )}
        {report.openingsWithoutOption.length > 0 && (
          <p>
            These openings are in this posting but not in your form:{" "}
            <strong>{report.openingsWithoutOption.join(", ")}</strong>. Nobody
            can apply to them yet.
          </p>
        )}
      </div>
    </div>
  );
}
