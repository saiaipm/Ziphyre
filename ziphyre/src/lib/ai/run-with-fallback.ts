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
/**
 * A provider that never answers must not hold the whole job.
 *
 * There was no timeout anywhere in this path. On a long-running host
 * that means a slow wait; on serverless it means the function is killed
 * at its duration limit with **nothing logged** — a timeout is not an
 * error — and the job row stays `running` forever. That is exactly how
 * a screening came to sit `in_progress` on production with no failure
 * to show for it.
 *
 * A provider that has not answered in this long is not going to; the
 * chain exists precisely so the next one can be tried.
 */
const PROVIDER_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} did not respond within 25s`)),
      PROVIDER_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function runWithFallback<T>(
  chain: DecryptedProvider[],
  run: (provider: DecryptedProvider) => Promise<T>,
): Promise<FallbackResult<T>> {
  const attempts: FallbackAttempt[] = [];

  for (const provider of chain) {
    const started = Date.now();
    try {
      const data = await withTimeout(run(provider), provider.provider);
      // Logged because the alternative is guessing from the outside
      // which stage of a job was slow, which cost most of an afternoon.
      console.log(
        `[ai] ${provider.provider}/${provider.model} ok in ${Date.now() - started}ms`,
      );
      return {
        ok: true,
        data,
        usedProvider: provider.provider,
        usedModel: provider.model,
        failedAttempts: [...attempts],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ai] ${provider.provider}/${provider.model} failed after ${Date.now() - started}ms: ${message}`,
      );
      attempts.push({
        provider: provider.provider,
        model: provider.model,
        error: message,
      });
    }
  }

  return { ok: false, attempts };
}
