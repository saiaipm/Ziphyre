import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import type { ProviderId } from "./providers";

// PROVIDERS/ProviderId are NOT re-exported here on purpose: this file
// carries "server-only" at the top, so anything importing from it —
// even just for a re-exported constant — pulls that guard in too and
// breaks in a Client Component. Import PROVIDERS/ProviderId from
// "./providers" directly; import getModel/validateProviderKey from here.

/** NVIDIA NIM speaks the OpenAI wire format, so it reuses that adapter. */
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * One interface across the three supported providers (FR-81). The
 * admin's own key, decrypted just-in-time by the caller — never held
 * longer than the single request that needs it.
 */
export function getModel(
  provider: ProviderId,
  model: string,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "nvidia":
      return createOpenAI({ apiKey, baseURL: NVIDIA_BASE_URL })(model);
  }
}

/**
 * A key that doesn't work should fail here, in front of the admin,
 * not silently at the moment a real application arrives (FR-83,
 * TechDecisions §12).
 */
export async function validateProviderKey(
  provider: ProviderId,
  model: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await generateText({
      model: getModel(provider, model, apiKey),
      prompt: "Reply with the single word: ok",
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}
