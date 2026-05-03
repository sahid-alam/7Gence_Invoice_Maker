"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Users,
  Settings,
  Building2,
  LogOut,
  Moon,
  Sun,
  Plug,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/profiles", label: "Profiles", icon: Building2 },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-56 flex flex-col h-full bg-sidebar border-r border-border shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <Image
            src="/logo/7gence-logo.svg"
            alt="7Gence"
            width={36}
            height={36}
            /* Logo SVG has dark paths:
               light mode (light sidebar) → show as-is (dark logo on light bg)
               dark mode (dark sidebar)   → invert to white */
            className="transition-opacity duration-200 group-hover:opacity-70 dark:brightness-0 dark:invert"
            priority
          />
          <div>
            <p className="font-bold text-sm tracking-tight leading-tight">7Gence</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Invoice Maker</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-0.5">
        <p className="text-[11px] text-muted-foreground truncate px-3 pb-1">{user.email}</p>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
        >
          <span className="relative w-[15px] h-[15px] shrink-0">
            <Sun size={15} className="absolute inset-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon size={15} className="absolute inset-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </span>
          Toggle theme
        </button>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
