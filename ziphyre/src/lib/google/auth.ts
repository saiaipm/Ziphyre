import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { bufferToPgBytea, pgByteaToBuffer } from "@/lib/pg-bytea";

/**
 * Read-only, by design. FR-63 ("never writes to the response sheet") becomes
 * impossible to violate rather than merely forbidden, because we never hold
 * a write scope to violate it with (tech spec §5.1).
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/forms.body.readonly",
];

/** Sign-in alone yields these; they don't constitute a "connection". */
const IDENTITY_SCOPES = ["openid", "email", "profile"];

export function hasWorkspaceScopes(scopes: string[]): boolean {
  return scopes.some(
    (s) => !IDENTITY_SCOPES.includes(s) && !s.startsWith("https://www.googleapis.com/auth/userinfo"),
  );
}

export type GoogleConnection = {
  googleEmail: string;
  scopes: string[];
  status: "active" | "needs_reconnect";
  connectedAt: string;
};

/** Never selects refresh_token_encrypted — that column is server-side only. */
export async function getConnection(
  organizationId: string,
): Promise<GoogleConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_connection")
    .select("google_email, scopes, status, created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  return {
    googleEmail: data.google_email,
    scopes: data.scopes,
    status: data.status as "active" | "needs_reconnect",
    connectedAt: data.created_at,
  };
}

export async function saveConnection(input: {
  organizationId: string;
  googleEmail: string;
  refreshToken: string;
  scopes: string[];
  connectedBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("google_connection").upsert(
    {
      organization_id: input.organizationId,
      google_email: input.googleEmail,
      refresh_token_encrypted: bufferToPgBytea(encryptSecret(input.refreshToken)),
      scopes: input.scopes,
      status: "active",
      connected_by: input.connectedBy,
    },
    { onConflict: "organization_id" },
  );
  if (error) throw error;
}

export async function disconnect(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("google_connection")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw error;
}

/** Thrown when the grant is gone for good. Retrying never fixes this. */
export class GoogleNeedsReconnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleNeedsReconnectError";
  }
}

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

/**
 * Exchanges the stored refresh token for a short-lived access token,
 * cached in-process until shortly before it expires.
 *
 * An `invalid_grant` means the user revoked access or the token was
 * expired out. That never recovers by retrying, so it flips the
 * connection to needs_reconnect (FR-4) and throws a distinct error the
 * job runner can treat as terminal instead of burning five attempts.
 */
export async function getAccessToken(organizationId: string): Promise<string> {
  const cached = tokenCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const admin = createAdminClient();
  const { data } = await admin
    .from("google_connection")
    .select("refresh_token_encrypted, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) {
    throw new GoogleNeedsReconnectError(
      "No Google account is connected for this organization.",
    );
  }

  const refreshToken = decryptSecret(
    pgByteaToBuffer(data.refresh_token_encrypted as string),
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      await admin
        .from("google_connection")
        .update({ status: "needs_reconnect" })
        .eq("organization_id", organizationId);
      tokenCache.delete(organizationId);
      throw new GoogleNeedsReconnectError(
        "Ziphyre has lost access to your Google account.",
      );
    }
    throw new Error(
      `Google token refresh failed: ${body.error_description ?? body.error ?? response.status}`,
    );
  }

  // 60s of headroom so a token can't expire mid-request.
  const expiresAt = Date.now() + ((body.expires_in ?? 3600) - 60) * 1000;
  tokenCache.set(organizationId, { token: body.access_token, expiresAt });

  if (data.status === "needs_reconnect") {
    await admin
      .from("google_connection")
      .update({ status: "active" })
      .eq("organization_id", organizationId);
  }

  return body.access_token;
}
