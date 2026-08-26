/**
 * Runtime configuration checks.
 *
 * M0 ships before Supabase credentials exist. Rather than crashing
 * or pretending, the app reports exactly what is missing and keeps every
 * screen reachable. Tech spec §3.1 — nothing silently half-works.
 */

export type SetupItem = {
  key: string;
  label: string;
  description: string;
  present: boolean;
  blocks: string;
};

export function getSetupState(): SetupItem[] {
  return [
    {
      key: "supabase",
      label: "Supabase project",
      description: "Database, authentication and CV storage.",
      present: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
      blocks: "Signing in, and everything that reads or writes data.",
    },
    {
      key: "seed_admin",
      label: "Seed admin email",
      description:
        "The one address that creates the organization on first sign-in.",
      present: Boolean(process.env.SEED_ADMIN_EMAIL),
      blocks: "Organization bootstrap.",
    },
    {
      key: "settings_encryption",
      label: "Settings encryption key",
      description: "Encrypts each organization's own AI provider key at rest.",
      present: Boolean(process.env.SETTINGS_ENCRYPTION_KEY),
      blocks: "Saving a screening provider, and requirement extraction.",
    },
  ];
}

export function isConfigured(): boolean {
  return getSetupState().every((item) => item.present);
}

export function missingCount(): number {
  return getSetupState().filter((item) => !item.present).length;
}
