"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveMailSettings } from "@/lib/mail/send";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * FR-113, FR-114 — the sending identity, one per organisation.
 *
 * The credentials are proven against Gmail before they are stored
 * (inside `saveMailSettings`), so a wrong app password is refused here
 * rather than discovered later by a candidate who never got an email.
 */
export async function saveSender(input: {
  fromEmail: string;
  fromName: string;
  appPassword: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (!input.appPassword.trim()) {
    return {
      ok: false,
      error:
        "Add the app password from your Google account. It isn't your normal password.",
    };
  }

  try {
    const result = await saveMailSettings({
      organizationId: session.organization.id,
      fromEmail,
      fromName: input.fromName.trim() || null,
      appPassword: input.appPassword,
    });
    if (!result.ok) return result;
  } catch (err) {
    // Almost always a missing SETTINGS_ENCRYPTION_KEY. Say so rather
    // than returning a stack trace to the browser.
    return {
      ok: false,
      error:
        err instanceof Error && err.message.includes("SETTINGS_ENCRYPTION_KEY")
          ? "Server isn't configured to store secrets. SETTINGS_ENCRYPTION_KEY is missing."
          : "Couldn't save the sending address.",
    };
  }

  revalidatePath("/settings/communications");
  return { ok: true };
}

/** FR-130. Ziphyre carries this link; it never reads a calendar. */
export async function saveBookingUrl(url: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\/\S+$/i.test(trimmed)) {
    return { ok: false, error: "That needs to be a full link starting with https://" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("mail_settings")
    .update({ booking_url: trimmed || null })
    .eq("organization_id", session.organization.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/communications");
  return { ok: true };
}
