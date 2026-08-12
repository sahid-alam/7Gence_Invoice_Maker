import { redirect } from "next/navigation";
import { getUser, getMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Suspense } from "react";
import { FlashToast } from "@/components/flash-toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const member = await getMember();
  // Signed in but not in an org — a real state, and distinct from signed out, so
  // it must not bounce to /login or the user would loop.
  if (!member) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-8">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-panel">
          <h1 className="text-lg font-semibold">No organization yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;re signed in as {user.email}, but this account hasn&apos;t been added
            to an organization. Ask an owner to add you from Settings.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations").select("name").eq("id", member.orgId).single();
  const sidebarUser = { ...member, orgName: org?.name ?? null };

  return (
    /* Floating-panel shell: the page ground shows through as a gutter, and the
       sidebar and content sit on it as separate surfaces. h-screen with padding
       needs border-box sizing (Tailwind's preflight gives us that) and min-h-0
       on the flex children, or the inner scroll container collapses. */
    <div className="flex h-screen gap-2 overflow-hidden bg-background p-0 lg:gap-2 lg:p-2">
      <Sidebar user={sidebarUser} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border bg-card lg:rounded-panel lg:border lg:shadow-panel">
        {/* Fixed-position tab bar + drawer, so it sits outside the flow. */}
        <MobileNav user={sidebarUser} />
        {/* pb-24 keeps the last row clear of the floating tab bar; reset on desktop. */}
        <main className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
          <Suspense>
            <FlashToast />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
