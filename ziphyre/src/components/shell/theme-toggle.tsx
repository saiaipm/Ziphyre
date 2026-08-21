"use client";

import { useLayoutEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

type Choice = "light" | "dark" | "system";

const OPTIONS: { value: Choice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && prefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/**
 * Three-way theme control for the account menu.
 *
 * No next-themes here — see layout.tsx and lib/theme-script.ts for why.
 * State is read lazily from localStorage so it matches what the inline
 * script already painted, and re-applied in a layout effect because
 * React's Strict Mode dev remount clears attributes it doesn't manage
 * from JSX (documented in the Next.js guide this follows).
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  });

  useLayoutEffect(() => {
    apply(choice);
  }, [choice]);

  // Live-update if the OS theme changes while "System" is selected.
  useLayoutEffect(() => {
    if (choice !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [choice]);

  function select(next: Choice) {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setChoice(next);
  }

  return (
    <div className="px-2 py-1.5">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        Theme
      </p>
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = choice === value;
          return (
            <button
              key={value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                select(value);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={active}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
