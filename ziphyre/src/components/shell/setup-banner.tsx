import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getSetupState } from "@/lib/config";

/**
 * Shown until the external services in TechDecisions §2 are configured.
 * Names exactly what is missing and what it blocks — never a vague error.
 */
export function SetupBanner() {
  const missing = getSetupState().filter((item) => !item.present);
  if (missing.length === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-fit-review-bg dark:border-amber-900/40">
      <div className="mx-auto flex max-w-[var(--container-max)] items-start gap-3 px-4 py-3 sm:px-8">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-fit-review"
          aria-hidden
        />
        <div className="text-sm">
          <span className="font-medium text-amber-900 dark:text-amber-100">
            Setup incomplete — {missing.length} of {getSetupState().length}{" "}
            services not connected.
          </span>{" "}
          <span className="text-amber-800 dark:text-amber-200/80">
            {missing.map((m) => m.label).join(", ")}. The interface works; data
            does not.
          </span>{" "}
          <Link
            href="/settings/connections"
            className="font-medium text-amber-900 underline underline-offset-2 dark:text-amber-100"
          >
            Finish setup
          </Link>
        </div>
      </div>
    </div>
  );
}
