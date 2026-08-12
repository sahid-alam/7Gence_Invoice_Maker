"use client";

import { useState } from "react";
import { SidebarContent } from "./sidebar-content";
import { cn } from "@/lib/utils";
import type { AppMember } from "@/lib/auth";

/**
 * Desktop rail. Animates width only — labels stay mounted and are cropped by
 * overflow-hidden (see SidebarContent), which keeps the collapse smooth instead
 * of reflowing every row. Hidden below lg, where the mobile tab bar takes over.
 *
 * The logo is the collapse control; there is no separate toggle button.
 *
 * Collapse state is component state, so it survives navigation (the layout does
 * not remount) but resets on reload. Persisting it means localStorage plus a
 * hydration guard — not worth it until someone actually asks.
 */
export function Sidebar({ user }: { user: AppMember & { orgName?: string | null } }) {
  const [open, setOpen] = useState(true);

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col overflow-hidden rounded-panel border border-border bg-sidebar shadow-panel lg:flex",
        "transition-[width] duration-300 ease-out-expo",
        open ? "w-56" : "w-[4.5rem]"
      )}
    >
      <SidebarContent user={user} open={open} onToggle={() => setOpen(!open)} />
    </aside>
  );
}
