"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROVIDERS,
  findProvider,
  defaultModelFor,
  modelLabel,
  type ProviderId,
} from "@/lib/ai/providers";
import {
  saveScreeningProvider,
  deleteScreeningProvider,
  reorderScreeningProviders,
} from "./actions";
import type { ConfiguredProvider } from "@/lib/provider-settings";

const COMPONENTS = [
  { name: "JD Fit", meaning: "How much of the described work they've done" },
  { name: "Experience", meaning: "Length and seniority against the opening" },
  { name: "Skills", meaning: "Tools and technical proficiencies named in the JD" },
  { name: "Qualification", meaning: "Credentials and education" },
  { name: "Location", meaning: "Current location and willingness to relocate" },
];

export function ScreeningForm({
  configured,
}: {
  configured: ConfiguredProvider[];
}) {
  const [provider, setProvider] = useState<ProviderId>(PROVIDERS[0].id);
  const [model, setModel] = useState<string>(defaultModelFor(PROVIDERS[0].id));
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const activeProvider = findProvider(provider) ?? PROVIDERS[0];
  const models = activeProvider.models;
  const selectedNote = models.find((m) => m.id === model)?.note;

  function onProviderChange(next: string) {
    const id = next as ProviderId;
    setProvider(id);
    setModel(defaultModelFor(id));
  }

  async function onSave() {
    setSaving(true);
    const result = await saveScreeningProvider({ provider, model, apiKey });
    setSaving(false);
    if (result.ok) {
      setApiKey("");
      toast.success("Key verified and saved");
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  async function onRemove(p: ProviderId) {
    setBusy(true);
    const result = await deleteScreeningProvider(p);
    setBusy(false);
    if (result.ok) toast.success("Provider removed");
    else toast.error("Couldn't remove", { description: result.error });
  }

  async function onMove(index: number, direction: -1 | 1) {
    const next = [...configured];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    setBusy(true);
    const result = await reorderScreeningProviders(next.map((c) => c.provider));
    setBusy(false);
    if (!result.ok) {
      toast.error("Couldn't reorder", { description: result.error });
    }
  }

  return (
    <div className="space-y-6">
      {configured.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-4 py-3 dark:border-amber-900/40">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-fit-review"
            aria-hidden
          />
          <p className="text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">Screening is paused.</span> Without a
            key, new applications arrive unscreened and marked for manual
            review.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-fit-strong-bg px-4 py-3">
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-fit-strong"
            aria-hidden
          />
          <p className="text-sm text-foreground">
            <span className="font-medium">
              Screening active — {configured.length} provider
              {configured.length === 1 ? "" : "s"} configured.
            </span>{" "}
            {configured.length > 1
              ? "If the first fails, the next is tried automatically."
              : "Add a second provider for automatic fallback."}
          </p>
        </div>
      )}

      {configured.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-divider px-6 py-4">
            <h2 className="text-sm font-semibold">Fallback order</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tried top to bottom until one succeeds. Every score records
              which model actually produced it.
            </p>
          </div>
          <ul className="divide-y divide-divider">
            {configured.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-6 py-3.5"
              >
                <span className="tabular w-5 shrink-0 text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {modelLabel(c.provider, c.model)}
                    {i === 0 && (
                      <span className="ml-2 rounded-full bg-fit-accent-bg px-2 py-0.5 text-[11px] font-medium text-fit-accent">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {findProvider(c.provider)?.label} · key ending{" "}
                    <span className="tabular">{c.keyHint}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy || i === 0}
                    onClick={() => onMove(i, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy || i === configured.length - 1}
                    onClick={() => onMove(i, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy}
                    onClick={() => onRemove(c.provider)}
                    aria-label={`Remove ${findProvider(c.provider)?.label}`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">
            {configured.length === 0 ? "Add a provider" : "Add or replace a provider"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Saving a provider you already have replaces its key.
          </p>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-5">
            <Label className="text-sm font-medium">Provider</Label>
            <Select value={provider} onValueChange={onProviderChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-5">
            <Label className="text-sm font-medium">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedNote && (
            <p className="text-xs text-muted-foreground sm:ml-[220px]">
              {selectedNote}
            </p>
          )}

          <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-5">
            <Label className="text-sm font-medium sm:pt-2">Your API key</Label>
            <div>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the key only — no quotes"
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Get one from {activeProvider.keyHelp}. Stored encrypted and
                verified on save — never shown again afterwards, only the last
                four characters.
              </p>
            </div>
          </div>

          <p className="rounded border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            Scores from different models aren&rsquo;t directly comparable, so
            each score records which model produced it. Adding or reordering
            providers never rescreens anyone already screened.
          </p>

          <Button onClick={onSave} disabled={saving}>
            {saving ? "Checking key…" : "Verify and save"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">How candidates are scored</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Five components, each out of 10, averaged equally.
          </p>
        </div>
        <ul className="divide-y divide-divider">
          {COMPONENTS.map((c) => (
            <li
              key={c.name}
              className="flex items-baseline justify-between gap-6 px-6 py-3"
            >
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-right text-xs text-muted-foreground">
                {c.meaning}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-divider px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Equal weighting — each component is one fifth of the overall score.
            Custom weights come later.
          </p>
        </div>
      </section>
    </div>
  );
}
