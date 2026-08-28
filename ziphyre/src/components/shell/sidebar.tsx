"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  Sparkles,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COLLAPSE_KEY = "ziphyre-sidebar-collapsed";

/**
 * The collapse preference lives in localStorage, which is an external
 * store — so it is read through useSyncExternalStore rather than copied
 * into state by an effect. That gives an explicit server snapshot
 * (expanded), so the first client render matches the server's and
 * hydration holds, and it keeps every mounted sidebar in step.
 */
const collapseListeners = new Set<() => void>();

const collapseStore = {
  subscribe(onChange: () => void) {
    collapseListeners.add(onChange);
    return () => collapseListeners.delete(onChange);
  },
  get: () => localStorage.getItem(COLLAPSE_KEY) === "1",
  /** Expanded is the server-render assumption; a stored preference applies after mount. */
  getServer: () => false,
  set(value: boolean) {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
    collapseListeners.forEach((listener) => listener());
  },
};

const primaryNav = [
  { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/postings", label: "Postings", icon: Briefcase, exact: false },
];

const settingsNav = [
  { href: "/settings/organization", label: "Organization", icon: Building2 },
  { href: "/settings/screening", label: "Screening", icon: Sparkles },
  { href: "/settings/communications", label: "Communications", icon: Mail },
];

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  // Reading a screening assessment beside a CV wants the width, so the
  // sidebar collapses to an icon rail rather than disappearing — the
  // nav stays reachable in one click and the indicator stays visible,
  // which a hidden-then-summoned drawer does not manage.
  //
  // Starts expanded on both server and client, then reads the stored
  // preference after mount. Branching on localStorage during render
  // would emit different markup on each side and fail hydration.
  const collapsed = useSyncExternalStore(
    collapseStore.subscribe,
    collapseStore.get,
    collapseStore.getServer,
  );

  const toggle = () => collapseStore.set(!collapsed);

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className="hidden lg:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200"
      style={{ width: collapsed ? "4rem" : "var(--sidebar-width)" }}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-6",
          collapsed ? "justify-center px-2" : "justify-between px-6",
        )}
      >
        {!collapsed && (
          <Link href="/" className="block min-w-0">
            <span className="text-[17px] font-semibold tracking-tight text-white">
              Ziphyre
            </span>
            <span className="mt-0.5 block text-[11px] tracking-wide text-slate-400">
              Screening Desk
            </span>
          </Link>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-sidebar-accent/60 hover:text-slate-100"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {primaryNav.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href}>
                <NavLink
                  href={href}
                  label={label}
                  Icon={Icon}
                  active={active}
                  collapsed={collapsed}
                />
              </li>
            );
          })}
        </ul>

        <p
          className={cn(
            "label-meta mt-7 mb-2 px-3 text-slate-500",
            collapsed && "sr-only",
          )}
        >
          Settings
        </p>
        <ul className="space-y-0.5">
          {settingsNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <NavLink
                  href={href}
                  label={label}
                  Icon={Icon}
                  active={active}
                  collapsed={collapsed}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-6 py-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Screening ranks candidates.
            <br />
            It never decides.
          </p>
        </div>
      )}
    </aside>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded py-2 text-sm transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-sidebar-accent text-white font-medium"
          : "text-slate-400 hover:bg-sidebar-accent/60 hover:text-slate-100",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {/* Kept for screen readers when collapsed: the icon alone is not a name. */}
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
