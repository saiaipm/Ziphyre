import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSetupState } from "@/lib/config";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  const items = getSetupState();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ziphyre reads applications from your Google Forms and opens the CVs
          candidates upload. It never edits your form or your responses.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Google account</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read-only access to Forms, Sheets and Drive.
          </p>
        </div>
        <div className="px-6 py-5">
          <ul className="mb-5 space-y-1.5">
            {[
              "See your form's question options",
              "Read new responses as they arrive",
              "Open the CVs candidates upload",
            ].map((scope) => (
              <li
                key={scope}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-fit-strong"
                  aria-hidden
                />
                {scope}
              </li>
            ))}
            <li className="flex items-start gap-2 text-sm text-muted-foreground">
              <X className="mt-0.5 size-3.5 shrink-0 text-fit-rejected" aria-hidden />
              No permission to change anything — by design
            </li>
          </ul>
          <Button disabled>Connect Google account</Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Needs Google OAuth credentials in the environment first.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Setup status</h2>
        </div>
        <ul className="divide-y divide-divider">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-start justify-between gap-4 px-6 py-4"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.description}
                </p>
                {!item.present && (
                  <p className="mt-1 text-xs text-fit-review">
                    Blocks: {item.blocks}
                  </p>
                )}
              </div>
              <span
                className={
                  item.present
                    ? "shrink-0 rounded-full bg-fit-strong-bg px-2.5 py-0.5 text-xs font-medium text-fit-strong"
                    : "shrink-0 rounded-full bg-fit-review-bg px-2.5 py-0.5 text-xs font-medium text-fit-review"
                }
              >
                {item.present ? "Connected" : "Not set"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
