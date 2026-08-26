"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  Sparkles,
} from "lucide-react";

const primaryNav = [
  { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/postings", label: "Postings", icon: Briefcase, exact: false },
];

const settingsNav = [
  { href: "/settings/organization", label: "Organization", icon: Building2 },
  { href: "/settings/screening", label: "Screening", icon: Sparkles },
];

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: "var(--sidebar-width)" }}
    >
      <div className="px-6 py-6">
        <Link href="/" className="block">
          <span className="text-[17px] font-semibold tracking-tight text-white">
            Ziphyre
          </span>
          <span className="mt-0.5 block text-[11px] tracking-wide text-slate-400">
            Screening Desk
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {primaryNav.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-white font-medium"
                      : "text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-100",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="label-meta mt-7 mb-2 px-3 text-slate-500">Settings</p>
        <ul className="space-y-0.5">
          {settingsNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-white font-medium"
                      : "text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-100",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Screening ranks candidates.
          <br />
          It never decides.
        </p>
      </div>
    </aside>
  );
}
