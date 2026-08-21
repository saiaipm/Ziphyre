/**
 * Runtime configuration checks.
 *
 * M0 ships before Supabase and Google credentials exist. Rather than crashing
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
      key: "google",
      label: "Google OAuth credentials",
      description:
        "Read-only access to Forms, Sheets and Drive, plus admin sign-in.",
      present: Boolean(process.env.GOOGLE_CLIENT_ID),
      blocks: "Connecting a form and importing applications.",
    },
    {
      key: "seed_admin",
      label: "Seed admin email",
      description:
        "The one address that creates the organization on first sign-in.",
      present: Boolean(process.env.SEED_ADMIN_EMAIL),
      blocks: "Organization bootstrap.",
    },
  ];
}

export function isConfigured(): boolean {
  return getSetupState().every((item) => item.present);
}

export function missingCount(): number {
  return getSetupState().filter((item) => !item.present).length;
}
