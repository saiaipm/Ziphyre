import { redirect } from "next/navigation";

/**
 * Communications moved to `/communications` when the outbox landed —
 * FR-133 makes it a working surface rather than a settings screen, and
 * FR-134 keeps the sending identity on the same page as the outbox.
 *
 * Kept as a redirect rather than deleted: this path was in the sidebar
 * all week and is the one a bookmark or an older note would point at.
 */
export default function CommunicationsSettingsRedirect() {
  redirect("/communications");
}
