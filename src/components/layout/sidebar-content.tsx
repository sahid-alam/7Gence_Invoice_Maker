"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { AppMember } from "@/lib/auth";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Banknote,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun,
  Plug,
  BarChart3,
} from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/payments", label: "Payments", icon: Banknote },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The four that get their own slot in the mobile tab bar; the rest live under "More". */
export const MOBILE_PRIMARY = ["/dashboard", "/invoices", "/payments", "/receipts"];

export function isNavActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Labels stay mounted when the rail collapses and are cropped by the panel's
 * overflow-hidden, rather than unmounted. Unmounting reflows the row and makes
 * the width animation stutter; fading a clipped label is smooth and keeps the
 * text in the accessibility tree so screen readers still announce the link.
 */
function label(open: boolean) {
  return cn(
    "min-w-0 whitespace-nowrap transition-[opacity,transform] duration-200 delay-[60ms] ease-out-expo",
    open ? "opacity-100 translate-x-0" : "pointer-events-none -translate-x-1.5 opacity-0"
  );
}

function Brand({ open }: { open: boolean }) {
  return (
    <>
      <Image
        src="/logo/7gence-logo.svg"
        alt="7Gence"
        width={36}
        height={36}
        className="shrink-0 transition-opacity duration-200 group-hover:opacity-70 dark:brightness-0 dark:invert"
        priority
      />
      <span className={label(open)}>
        <span className="block text-sm font-bold leading-tight tracking-tight">7Gence</span>
        <span className="block text-[10px] leading-tight text-muted-foreground">Invoice Maker</span>
      </span>
    </>
  );
}

/** Shared inner content of the sidebar — used by the desktop rail and the mobile drawer. */
export function SidebarContent({
  user,
  open = true,
  onNavigate,
  onToggle,
}: {
  user: AppMember & { orgName?: string | null };
  /** false = collapsed icon rail (desktop only) */
  open?: boolean;
  onNavigate?: () => void;
  /** When given, the logo becomes the collapse/expand control instead of a link home. */
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  const row =
    "flex items-center gap-3 rounded-full px-3.5 py-2 text-sm transition-colors duration-150 ease-out-expo";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-5">
        {/* On the desktop rail the logo IS the collapse control — click it to fold
            and unfold. Dashboard is the first nav item right below, so nothing is
            lost by the logo no longer linking home. In the mobile drawer there is
            nothing to collapse, so it stays a link. */}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            className="group flex w-full items-center gap-3 rounded-full text-left outline-none"
          >
            <Brand open={open} />
          </button>
        ) : (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="group flex items-center gap-3"
            title="7Gence Invoice Maker"
          >
            <Brand open={open} />
          </Link>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map(({ href, label: text, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={text}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                row,
                isActive
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon size={15} className="shrink-0" />
              <span className={label(open)}>{text}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-border p-3">
        {/* Who you are and which organization — the org was invisible before this. */}
        <Link
          href="/settings"
          onClick={onNavigate}
          title={`${user.email} · ${user.role === "owner" ? "Owner" : "Member"}`}
          className={cn(row, "mb-1 text-muted-foreground hover:bg-accent hover:text-foreground")}
        >
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-primary text-[9px] font-bold uppercase text-primary-foreground">
            {(user.email ?? "?").slice(0, 2)}
          </span>
          <span className={cn("min-w-0", label(open))}>
            <span className="block truncate text-xs font-medium text-foreground">
              {(user.email ?? "").split("@")[0]}
            </span>
            <span className="block text-[10px] capitalize leading-tight">
              {user.orgName ? `${user.orgName} · ` : ""}{user.role}
            </span>
          </span>
        </Link>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          className={cn(row, "w-full text-muted-foreground hover:bg-accent hover:text-foreground")}
        >
          <span className="relative h-[15px] w-[15px] shrink-0">
            <Sun size={15} className="absolute inset-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon size={15} className="absolute inset-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </span>
          <span className={label(open)}>Toggle theme</span>
        </button>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className={cn(row, "w-full text-muted-foreground hover:bg-accent hover:text-foreground")}
        >
          <LogOut size={15} className="shrink-0" />
          <span className={label(open)}>Sign out</span>
        </button>
      </div>
    </div>
  );
}
