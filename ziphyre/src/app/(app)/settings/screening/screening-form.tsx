"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
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

const PROVIDERS = [
  { id: "claude", label: "Claude", models: ["claude-sonnet-5", "claude-opus-5"] },
  { id: "gemini", label: "Gemini", models: ["gemini-2.5-pro"] },
  { id: "openai", label: "OpenAI", models: ["gpt-5"] },
] as const;

const COMPONENTS = [
  { name: "JD Fit", meaning: "How much of the described work they've done" },
  { name: "Experience", meaning: "Length and seniority against the opening" },
  { name: "Skills", meaning: "Tools and technical proficiencies named in the JD" },
  { name: "Qualification", meaning: "Credentials and education" },
  { name: "Location", meaning: "Current location and willingness to relocate" },
];

export function ScreeningForm() {
  const [provider, setProvider] = useState<string>("claude");
  const [model, setModel] = useState<string>("claude-sonnet-5");
  const [apiKey, setApiKey] = useState("");

  const models =
    PROVIDERS.find((p) => p.id === provider)?.models ?? PROVIDERS[0].models;

  function onProviderChange(next: string) {
    setProvider(next);
    const first = PROVIDERS.find((p) => p.id === next)?.models[0];
    if (first) setModel(first);
  }

  function onSave() {
    if (!apiKey.trim()) {
      toast.error("Add a key so screening can run.");
      return;
    }
    toast.success("Saved locally", {
      description: "Not stored yet — connect Supabase to persist changes.",
    });
  }

  return (
    <div className="space-y-6">
      {!apiKey && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-4 py-3">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-fit-review"
            aria-hidden
          />
          <p className="text-sm text-amber-900">
            <span className="font-medium">Screening is paused.</span> Without a
            key, new applications arrive unscreened and marked for manual
            review.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Provider</h2>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-5">
            <Label className="text-sm font-medium">Screening provider</Label>
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
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-5">
            <Label className="text-sm font-medium sm:pt-2">Your API key</Label>
            <div>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Stored encrypted. Never shown again after saving — only the last
                four characters.
              </p>
            </div>
          </div>

          <p className="rounded border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            Changing provider won&rsquo;t rescreen anyone already screened.
            Scores from different providers aren&rsquo;t directly comparable, so
            each score records which provider produced it.
          </p>

          <Button onClick={onSave}>Save changes</Button>
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
