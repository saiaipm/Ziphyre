import "server-only";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret, keyHint } from "@/lib/crypto";
import { bufferToPgBytea, pgByteaToBuffer } from "@/lib/pg-bytea";
import type { ProviderId } from "@/lib/ai/providers";

export type ConfiguredProvider = {
  id: string;
  provider: ProviderId;
  model: string;
  keyHint: string | null;
  priority: number;
  validatedAt: string | null;
};

/**
 * For the settings screen. Never selects api_key_encrypted — the rule
 * from TechDecisions §8 ("never returned to the browser") is enforced
 * right here, by which columns this query asks for.
 *
 * Ordered by priority: the first entry is tried first when screening.
 */
export async function getConfiguredProviders(): Promise<ConfiguredProvider[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_settings")
    .select("id, provider, model, key_hint, priority, validated_at")
    .order("priority", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider as ProviderId,
    model: row.model,
    keyHint: row.key_hint,
    priority: row.priority,
    validatedAt: row.validated_at,
  }));
}

export type DecryptedProvider = {
  provider: ProviderId;
  model: string;
  apiKey: string;
};

/**
 * The full fallback chain, in order, decrypted. Screening walks this
 * list until a call succeeds.
 *
 * Keys are decrypted server-side and must not travel further than the
 * single AI call that needs them (TechDecisions §8).
 */
export async function getProviderChain(): Promise<DecryptedProvider[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("provider_settings")
    .select("provider, model, api_key_encrypted")
    .order("priority", { ascending: true });

  return (data ?? [])
    .filter((row) => row.api_key_encrypted)
    .map((row) => ({
      provider: row.provider as ProviderId,
      model: row.model,
      apiKey: decryptSecret(pgByteaToBuffer(row.api_key_encrypted as string)),
    }));
}

/**
 * Upserts one provider. Re-saving an existing provider replaces its
 * key rather than adding a duplicate (unique on organization+provider).
 * New providers are appended to the end of the fallback order.
 */
export async function saveProviderSettings(
  organizationId: string,
  provider: ProviderId,
  model: string,
  apiKey: string,
) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("provider_settings")
    .select("id, priority")
    .eq("provider", provider)
    .maybeSingle();

  let priority = existing?.priority;
  if (priority === undefined) {
    const { data: all } = await supabase
      .from("provider_settings")
      .select("priority")
      .order("priority", { ascending: false })
      .limit(1);
    priority = (all?.[0]?.priority ?? -1) + 1;
  }

  const { error } = await supabase.from("provider_settings").upsert(
    {
      organization_id: organizationId,
      provider,
      model,
      api_key_encrypted: bufferToPgBytea(encryptSecret(apiKey)),
      key_hint: keyHint(apiKey),
      priority,
      validated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw error;
}

export async function removeProvider(provider: ProviderId) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_settings")
    .delete()
    .eq("provider", provider);
  if (error) throw error;
}

/** Reorders the fallback chain. `order` is provider ids, first tried first. */
export async function setProviderOrder(order: ProviderId[]) {
  const supabase = await createClient();
  for (let i = 0; i < order.length; i++) {
    const { error } = await supabase
      .from("provider_settings")
      .update({ priority: i })
      .eq("provider", order[i]);
    if (error) throw error;
  }
}
