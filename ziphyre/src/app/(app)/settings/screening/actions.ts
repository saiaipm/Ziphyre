"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import {
  saveProviderSettings,
  removeProvider,
  setProviderOrder,
} from "@/lib/provider-settings";
import { validateProviderKey } from "@/lib/ai/provider";
import type { ProviderId } from "@/lib/ai/providers";

export type SaveProviderResult = { ok: true } | { ok: false; error: string };

export async function saveScreeningProvider(input: {
  provider: ProviderId;
  model: string;
  apiKey: string;
}): Promise<SaveProviderResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  if (!input.apiKey.trim()) {
    return { ok: false, error: "Add a key so screening can run." };
  }

  const validation = await validateProviderKey(
    input.provider,
    input.model,
    input.apiKey.trim(),
  );
  if (!validation.ok) {
    return { ok: false, error: `That key didn't work: ${validation.reason}` };
  }

  try {
    await saveProviderSettings(
      session.organization.id,
      input.provider,
      input.model,
      input.apiKey.trim(),
    );
  } catch (err) {
    // Almost always a missing SETTINGS_ENCRYPTION_KEY — fail with a
    // message that says so, not a raw stack trace on the client.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings/screening");
  return { ok: true };
}

export async function deleteScreeningProvider(
  provider: ProviderId,
): Promise<SaveProviderResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    await removeProvider(provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings/screening");
  return { ok: true };
}

export async function reorderScreeningProviders(
  order: ProviderId[],
): Promise<SaveProviderResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    await setProviderOrder(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings/screening");
  return { ok: true };
}
