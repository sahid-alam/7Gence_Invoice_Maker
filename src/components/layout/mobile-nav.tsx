"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { SidebarContent, navItems, MOBILE_PRIMARY, isNavActive } from "./sidebar-content";
import { cn } from "@/lib/utils";
import type { AppMember } from "@/lib/auth";

const primary = MOBILE_PRIMARY.map((href) => navItems.find((n) => n.href === href)!);

/**
 * Mobile navigation: a floating bottom tab bar with the four most-used
 * destinations, plus "More" which opens the full drawer. Both hidden at lg and
 * up, where the desktop rail takes over.
 *
 * The drawer stays mounted and translates rather than conditionally rendering,
 * so it animates both ways instead of popping in on open and vanishing on close.
 */
export function MobileNav({ user }: { user: AppMember & { orgName?: string | null } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change — tapping a link should leave the drawer behind.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // "More" lights up when the current route has no tab of its own.
  const moreActive = open || !primary.some((n) => isNavActive(n.href, pathname));

  const slot =
    "flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 outline-none transition-[background-color,color,transform] duration-150 ease-out-expo active:scale-95";
  const tone = (active: boolean) =>
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-3 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-pop">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(slot, tone(active))}
              >
                <Icon size={18} strokeWidth={active ? 2.25 : 2} />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(slot, tone(moreActive))}
          >
            <MoreHorizontal size={18} strokeWidth={moreActive ? 2.25 : 2} />
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>

      <div
        className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-300 ease-out-expo",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          role="dialog"
          aria-modal={open}
          aria-label="All sections"
          className={cn(
            "absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-border bg-sidebar shadow-pop",
            "transition-transform duration-300 ease-out-expo",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out-expo hover:bg-accent hover:text-foreground"
          >
            <X size={16} />
          </button>
          <SidebarContent user={user} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </>
  );
}
