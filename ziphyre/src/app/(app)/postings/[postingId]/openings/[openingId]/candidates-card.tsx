"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { modelLabel } from "@/lib/ai/providers";
import type { ApplicationListItem } from "@/lib/applications";
import {
  addCandidatesToOpening,
  refreshApplications,
  retryScreening,
} from "../../../actions";

const POLL_MS = 4000;

type PendingFile = { key: string; file: File; name: string };

export function CandidatesCard({
  openingId,
  initialApplications,
}: {
  openingId: string;
  initialApplications: ApplicationListItem[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInFlight = applications.some(
    (a) => a.screeningStatus === "pending" || a.screeningStatus === "in_progress",
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(async () => {
      const result = await refreshApplications(openingId);
      if (result.ok) setApplications(result.data);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasInFlight, openingId]);

  function onFilesChosen(fileList: FileList | null) {
    if (!fileList) return;
    const next = Array.from(fileList).map((file) => ({
      key: crypto.randomUUID(),
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
    }));
    setPending((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function renamePending(key: string, name: string) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, name } : p)));
  }

  async function onUpload() {
    if (pending.length === 0) return;
    setUploading(true);

    const formData = new FormData();
    for (const p of pending) {
      formData.append("file", p.file);
      formData.append("name", p.name);
    }

    const result = await addCandidatesToOpening(openingId, formData);
    setUploading(false);

    if (!result.ok) {
      toast.error("Couldn't add candidates", { description: result.error });
      return;
    }

    setPending([]);
    toast.success(
      `Added ${result.data.added} candidate${result.data.added === 1 ? "" : "s"}`,
      {
        description:
          result.data.skipped.length > 0
            ? `Skipped: ${result.data.skipped.join(", ")}`
            : "Screening starts automatically.",
      },
    );

    const refreshed = await refreshApplications(openingId);
    if (refreshed.ok) setApplications(refreshed.data);
  }

  async function onRetry(applicationId: string) {
    const result = await retryScreening(applicationId);
    if (!result.ok) {
      toast.error("Couldn't retry", { description: result.error });
      return;
    }
    toast.info("Retrying screening…");
    const refreshed = await refreshApplications(openingId);
    if (refreshed.ok) setApplications(refreshed.data);
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">Candidates</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add candidates by uploading their CVs. Screening starts on its own
          &mdash; there&rsquo;s no button for it.
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => onFilesChosen(e.target.files)}
            className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />

          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.key} className="flex items-center gap-2">
                  <Input
                    value={p.name}
                    onChange={(e) => renamePending(p.key, e.target.value)}
                    className="flex-1"
                  />
                  <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
                    {p.file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => removePending(p.key)}
                    aria-label="Remove"
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <Button size="sm" onClick={onUpload} disabled={uploading}>
              <Upload className="size-3.5" aria-hidden />
              {uploading
                ? "Adding…"
                : `Add ${pending.length} candidate${pending.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>

        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No candidates yet. Applications appear here once you add CVs.
          </p>
        ) : (
          <ul className="divide-y divide-divider">
            {applications.map((app) => (
              <ApplicationRow key={app.id} app={app} onRetry={onRetry} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ApplicationRow({
  app,
  onRetry,
}: {
  app: ApplicationListItem;
  onRetry: (applicationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = app.candidateName ?? "Unnamed candidate";

  if (app.screeningStatus === "needs_manual_review") {
    return (
      <li className="flex items-start gap-3 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fit-review" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            Needs manual review — {app.screeningFailureReason}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onRetry(app.id)}>
          <RotateCcw className="size-3.5" aria-hidden />
          Retry
        </Button>
      </li>
    );
  }

  if (app.screeningStatus !== "complete" || !app.screening) {
    return (
      <li className="flex items-center gap-3 py-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{name}</p>
        <span className="text-xs text-muted-foreground">Screening…</span>
      </li>
    );
  }

  const s = app.screening;
  const mustHaveCount = s.mustHaveResult.length;
  const mustHaveMet = s.mustHaveResult.filter((m) => m.met).length;

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/50"
        >
          <div className="flex-1">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {mustHaveCount === 0
                ? "No must-haves set"
                : `${mustHaveMet}/${mustHaveCount} must-haves met`}
            </p>
          </div>
          <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
            <Score label="JD" value={s.jdFit} />
            <Score label="Exp" value={s.experience} />
            <Score label="Skills" value={s.skills} />
            <Score label="Qual" value={s.qualification} />
            <Score label="Loc" value={s.location} />
          </div>
          <Badge variant={s.meetsAllMustHaves ? "default" : "outline"}>
            {s.overall.toFixed(1)} / 10
          </Badge>
        </button>
      </li>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              Overall {s.overall.toFixed(1)}/10 — equal-weighted average of the
              five components below.
              {s.usedFallback && (
                <> Screened by {modelLabel(s.provider, s.model)} after your primary provider failed.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <Score label="JD Fit" value={s.jdFit} />
              <Score label="Experience" value={s.experience} />
              <Score label="Skills" value={s.skills} />
              <Score label="Qualification" value={s.qualification} />
              <Score label="Location" value={s.location} />
            </div>

            {mustHaveCount > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Must-haves</p>
                <ul className="mt-1 space-y-1">
                  {s.mustHaveResult.map((m) => (
                    <li key={m.requirementId} className="text-xs">
                      <span className={m.met ? "text-fit-shortlisted" : "text-fit-review"}>
                        {m.met ? "✓" : "✗"}
                      </span>{" "}
                      {m.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Strengths</p>
              <p className="mt-1 text-sm">{s.strengths}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Gaps</p>
              <p className="mt-1 text-sm">{s.gaps}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Overall read</p>
              <p className="mt-1 text-sm">{s.overallRead}</p>
            </div>
            {s.experienceDiscrepancy && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Experience discrepancy
                </p>
                <p className="mt-1 text-sm">{s.experienceDiscrepancy}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Scored by {modelLabel(s.provider, s.model)}.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
