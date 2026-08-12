import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string | null;
}

/**
 * The authenticated user, or null.
 *
 * Uses `getClaims()`, NOT `getUser()`. `getUser()` makes a network round trip to
 * the Supabase auth server on every single call — measured at 200–560ms here, and
 * it is never cached. `getClaims()` verifies the JWT signature locally against the
 * project's JWKS (this project uses asymmetric signing keys), so it costs one
 * ~300ms fetch per server process and ~0ms after that.
 *
 * This is still a real verification — do not "optimise" it further into
 * `getSession()`, which returns the cookie's contents without checking the
 * signature and would let a forged cookie through.
 *
 * React `cache()` on top dedupes within a single request.
 */
export const getUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});

export interface AppMember extends AppUser {
  orgId: string;
  role: "owner" | "member";
  /** Sender identity this person invoices under by default, if set. */
  defaultProfileId: string | null;
}

/**
 * The signed-in person together with the organization they belong to.
 *
 * `orgId` is the tenancy key that replaces `owner_id` on every table; the user's
 * own `id` becomes `created_by`, which is what finally lets the activity trail say
 * who did something rather than only what happened.
 *
 * One membership per person for now. If someone ever belongs to two orgs this
 * returns the first, and an org switcher becomes a real feature rather than a
 * guess — deliberately not designed for yet.
 *
 * Returns null when the org tables do not exist yet (migrations 0016/0017 not run),
 * so this can ship before them without breaking anything.
 */
export const getMember = cache(async (): Promise<AppMember | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, default_profile_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...user,
    orgId: data.org_id,
    role: data.role as "owner" | "member",
    defaultProfileId: data.default_profile_id ?? null,
  };
});

/**
 * The caller, guaranteed to belong to an organization. Every Server Action, page
 * and route handler that touches data goes through this.
 *
 * `member.orgId` scopes what they may see; `member.id` records who acted. Two
 * different questions, deliberately two different values — don't collapse them.
 *
 * A signed-in user with no membership is a distinct case from not being signed in,
 * and must not redirect to /login: they have a valid session, so that would loop.
 */
export async function requireMember(): Promise<AppMember> {
  const user = await getUser();
  if (!user) redirect("/login");

  const member = await getMember();
  if (!member) {
    throw new Error(
      "Your account isn't part of an organization yet. Ask an owner to invite you."
    );
  }
  return member;
}
