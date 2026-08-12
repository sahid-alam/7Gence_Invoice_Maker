import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listMembers } from "@/actions/members";
import { TeamSection } from "@/components/settings/team-section";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { Building2, ChevronRight, KeyRound, Shield, User } from "lucide-react";
import { DefaultProfileButton } from "@/components/settings/default-profile-button";

export default async function SettingsPage() {
  const member = await requireMember();
  const supabase = await createClient();

  const [orgRes, profilesRes, members] = await Promise.all([
    supabase.from("organizations").select("name, created_at").eq("id", member.orgId).single(),
    supabase
      .from("business_profiles")
      .select("id, display_name, invoice_prefix, country")
      .eq("org_id", member.orgId)
      .order("display_name"),
    listMembers(),
  ]);

  const org = orgRes.data;
  const profiles = profilesRes.data ?? [];
  const defaultProfile = profiles.find((p) => p.id === member.defaultProfileId) ?? null;

  return (
    <div className="max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {member.role === "owner" ? "Owner" : "Member"}
        </p>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Your organization, who has access, and the identity you invoice under.
        </p>
      </div>

      {/* Organization */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{org?.name ?? "Organization"}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {member.role === "owner" ? <Shield size={11} /> : <User size={11} />}
              You are {member.role === "owner" ? "an owner" : "a member"} ·{" "}
              {members.length} {members.length === 1 ? "person" : "people"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Everything in this app belongs to the organization, not to an individual
          account. Invoices, payments and clients are shared; who did what is recorded
          per person on each invoice&apos;s activity.
        </p>
      </div>

      <TeamSection members={members} isOwner={member.role === "owner"} orgName={org?.name ?? "the organization"} />

      {/* Sender identities — what "Profiles" actually are */}
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">Sender identity</h3>
            <p className="text-xs text-muted-foreground">
              The &ldquo;From&rdquo; on your invoices — name, address, tax numbers, invoice
              numbering and bank details.
            </p>
          </div>
          <Link
            href="/profiles"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground hover:underline"
          >
            Manage <ChevronRight size={13} />
          </Link>
        </div>

        <div className="px-5 py-4">
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet.{" "}
              <Link href="/profiles/new" className="underline">Create one</Link> before invoicing.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/profiles/${p.id}`} className="font-medium hover:underline">
                    {p.display_name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{p.invoice_prefix}</span>
                  <DefaultProfileButton profileId={p.id} isDefault={defaultProfile?.id === p.id} />
                </li>
              ))}
            </ul>
          )}

          {profiles.length > 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              You have more than one, so the invoice form asks which to use — it
              opens on your default. With a single identity that choice disappears
              from the form and the dashboard filters entirely.
            </p>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="text-sm font-semibold">Your account</h3>
        <p className="mt-1 text-sm text-muted-foreground">{member.email}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/reset-password"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            <KeyRound size={14} />
            Change password
          </Link>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
