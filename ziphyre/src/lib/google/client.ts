import "server-only";
import { getAccessToken, GoogleNeedsReconnectError } from "@/lib/google/auth";

/**
 * Four read-only REST calls is all this integration needs, so it uses
 * plain fetch rather than the `googleapis` client — a large dependency
 * that also carries its own module loading, which this bundler has
 * already proven awkward about (see TechDecisions §7, pdf-parse).
 */
async function googleFetch(
  organizationId: string,
  url: string,
): Promise<Response> {
  const token = await getAccessToken(organizationId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 || response.status === 403) {
    throw new GoogleNeedsReconnectError(
      "Ziphyre has lost access to your Google account.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Google API ${response.status} for ${new URL(url).pathname}: ${await response.text()}`,
    );
  }
  return response;
}

export async function googleJson<T>(
  organizationId: string,
  url: string,
): Promise<T> {
  const response = await googleFetch(organizationId, url);
  return (await response.json()) as T;
}

export async function googleBytes(
  organizationId: string,
  url: string,
): Promise<Buffer> {
  const response = await googleFetch(organizationId, url);
  return Buffer.from(await response.arrayBuffer());
}
