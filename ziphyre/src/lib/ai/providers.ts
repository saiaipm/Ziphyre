/**
 * Client-safe constants — no provider SDKs, no server-only import.
 * The actual model calls live in provider.ts, which is server-only.
 *
 * Deliberately a short, curated list rather than every model each
 * vendor offers. Screening is a high-volume, low-complexity task —
 * extraction plus bounded judgement, run once per application — so
 * the cheap/fast tier is the right default and frontier reasoning
 * models would burn cost for no measurable gain.
 *
 * All three are TEXT-IN. CVs are parsed to text before the model is
 * called (one pipeline, not two), which is required anyway because
 * GPT-OSS-20B has no vision, and because FR-47 needs a text-extraction
 * pass to catch scanned CVs before spending an API call.
 */
export type ProviderId = "openai" | "google" | "nvidia";

export type ProviderModel = {
  /** Exact model id sent to the API. */
  id: string;
  /** Official name, shown to the admin. Never a raw slug. */
  label: string;
  /** One line on why this model is in the list. */
  note: string;
};

export type Provider = {
  id: ProviderId;
  label: string;
  /** Where the admin gets a key for this provider. */
  keyHelp: string;
  models: ProviderModel[];
};

export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyHelp: "platform.openai.com → API keys",
    models: [
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        note: "Fast and inexpensive. Reliable structured output.",
      },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    keyHelp: "aistudio.google.com → Get API key",
    // The 2.5 line is retired for generation — still listed by the API,
    // but requests are refused with a message pointing at 3.6+. Pin
    // explicit versions rather than the `-latest` aliases Google also
    // offers: an alias silently changes model underneath, which would
    // quietly break FR-49 (every score records the model that produced
    // it, so two scores can be compared honestly).
    models: [
      {
        id: "gemini-3.5-flash-lite",
        label: "Gemini 3.5 Flash-Lite",
        note: "Cheapest and fastest. Good default for screening.",
      },
      {
        id: "gemini-3.6-flash",
        label: "Gemini 3.6 Flash",
        note: "More capable than Flash-Lite, still inexpensive.",
      },
      {
        id: "gemini-3.7-flash",
        label: "Gemini 3.7 Flash",
        note: "Newest Flash model.",
      },
    ],
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    keyHelp: "build.nvidia.com → API key",
    models: [
      {
        id: "openai/gpt-oss-20b",
        label: "GPT-OSS-20B",
        note: "Open-weight fallback. Text only — no document vision.",
      },
    ],
  },
];

export function findProvider(id: ProviderId): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function defaultModelFor(id: ProviderId): string {
  return findProvider(id)?.models[0]?.id ?? PROVIDERS[0].models[0].id;
}

/** Official display name for a stored provider+model pair. */
export function modelLabel(providerId: ProviderId, modelId: string): string {
  return (
    findProvider(providerId)?.models.find((m) => m.id === modelId)?.label ??
    modelId
  );
}
