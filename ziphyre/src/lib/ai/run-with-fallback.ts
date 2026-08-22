import "server-only";
import type { DecryptedProvider } from "@/lib/provider-settings";
import type { ProviderId } from "@/lib/ai/providers";

export type FallbackAttempt = {
  provider: ProviderId;
  model: string;
  error: string;
};

export type FallbackResult<T> =
  | {
      ok: true;
      data: T;
      /** The provider that actually produced this result. */
      usedProvider: ProviderId;
      usedModel: string;
      /** Providers tried and failed before this one succeeded. */
      failedAttempts: FallbackAttempt[];
    }
  | { ok: false; attempts: FallbackAttempt[] };

/**
 * Walks the configured provider chain in order until one succeeds.
 *
 * **Always returns which provider produced the result.** With fallback
 * enabled you can no longer predict in advance which model scored a
 * given candidate, so recording it is not bookkeeping — it is the only
 * thing that keeps FR-49 honest. Two candidates scored by different
 * models are not directly comparable, and the caller must be able to
 * tell that they were.
 */
export async function runWithFallback<T>(
  chain: DecryptedProvider[],
  run: (provider: DecryptedProvider) => Promise<T>,
): Promise<FallbackResult<T>> {
  const attempts: FallbackAttempt[] = [];

  for (const provider of chain) {
    try {
      const data = await run(provider);
      return {
        ok: true,
        data,
        usedProvider: provider.provider,
        usedModel: provider.model,
        failedAttempts: [...attempts],
      };
    } catch (err) {
      attempts.push({
        provider: provider.provider,
        model: provider.model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: false, attempts };
}
