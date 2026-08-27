"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ApplicationListItem } from "@/lib/applications";

type Format = "csv" | "xlsx" | "pdf";

const FORMATS: { key: Format; label: string; hint: string }[] = [
  { key: "csv", label: "Spreadsheet (CSV)", hint: "Opens anywhere" },
  { key: "xlsx", label: "Spreadsheet (Excel)", hint: "Sortable, filterable" },
  { key: "pdf", label: "Document (PDF)", hint: "Reads like a shortlist" },
];

/**
 * FR-71 – FR-75, and Flow F. Scope, then format, then the CV option,
 * in the order the flow asks them.
 *
 * The dialog sends **ids and an order, never rows** — the file is built
 * from a fresh read on the server, so what lands in the spreadsheet is
 * what the database says, not what this component happened to be
 * holding.
 */
export function ExportDialog({
  openingId,
  visible,
  selectedIds,
}: {
  openingId: string;
  /** Already filtered and sorted: FR-72 wants the order on screen. */
  visible: ApplicationListItem[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"view" | "selected">("view");
  const [format, setFormat] = useState<Format>("xlsx");
  const [includeCvs, setIncludeCvs] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedIds.length;
  // Selection is only offered when there is one; defaulting to a scope
  // that means "nothing" is how an export comes out empty.
  const effectiveScope = selectedCount === 0 ? "view" : scope;
  const ids =
    effectiveScope === "selected"
      ? visible.filter((a) => selectedIds.includes(a.id)).map((a) => a.id)
      : visible.map((a) => a.id);

  async function onDownload() {
    setBusy(true);
    try {
      const response = await fetch(`/api/openings/${openingId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds: ids, format, includeCvs }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.error("Couldn't export", {
          description: body.message ?? "Please try again.",
        });
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="(.+?)"/)?.[1] ?? "candidates";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setOpen(false);
      toast.success(`Exported ${ids.length} candidate${ids.length === 1 ? "" : "s"}`, {
        description: filename,
      });
    } catch {
      toast.error("Couldn't export", { description: "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={visible.length === 0}
      >
        <Download className="size-3.5" aria-hidden />
        Export
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export candidates</DialogTitle>
            <DialogDescription>
              This file contains candidates&rsquo; personal information.
              It&rsquo;s for internal use — once downloaded, it&rsquo;s outside
              Ziphyre.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedCount > 0 && (
              <Choice
                label="What to export"
                options={[
                  { key: "view", label: `Everything in this view (${visible.length})` },
                  { key: "selected", label: `Only selected (${selectedCount})` },
                ]}
                value={effectiveScope}
                onChange={(v) => setScope(v as "view" | "selected")}
              />
            )}

            <Choice
              label="Format"
              options={FORMATS.map((f) => ({
                key: f.key,
                label: f.label,
                hint: f.hint,
              }))}
              value={format}
              onChange={(v) => setFormat(v as Format)}
            />

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={includeCvs}
                onCheckedChange={(v) => setIncludeCvs(v === true)}
                className="mt-0.5"
              />
              <span>
                Include CV files
                <span className="block text-xs text-muted-foreground">
                  Delivers a zip: the report above, plus each candidate&rsquo;s
                  CV named after them.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={onDownload} disabled={busy || ids.length === 0}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="size-3.5" aria-hidden />
              )}
              {busy ? "Preparing…" : `Download ${ids.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string; hint?: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 space-y-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={value === o.key}
            className={cn(
              "flex w-full items-baseline justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              value === o.key
                ? "border-foreground bg-muted"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span>{o.label}</span>
            {o.hint && (
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
