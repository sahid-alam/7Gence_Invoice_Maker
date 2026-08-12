"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { getGmailTransport, escapeHtml } from "@/lib/gmail";

/**
 * Initial password for a new member.
 *
 * Generated here, not in the browser. `Math.random()` is not a CSPRNG — V8's
 * xorshift128+ state can be recovered from observed output — and a short
 * word-word-digits pattern carries roughly 19 bits, which is brute-forceable.
 * This credential opens the whole organization's invoices and bank details, so
 * it gets 128 bits from the OS entropy pool instead.
 */
function generatePassword() {
  return randomBytes(16).toString("base64url");
}

export interface OrgMember {
  userId: string;
  email: string;
  role: "owner" | "member";
  defaultProfileId: string | null;
  isYou: boolean;
  joinedAt: string;
}

/**
 * Admin client, service-role key. Needed because member management touches
 * `auth.users`, which the anon key cannot read or write.
 *
 * Every caller MUST establish the caller is an owner of the org first — this
 * client bypasses RLS entirely.
 */
function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

/** Everyone in the caller's organization, with their email resolved. */
export async function listMembers(): Promise<OrgMember[]> {
  const me = await requireMember();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("user_id, role, default_profile_id, created_at")
    .eq("org_id", me.orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  // Emails live in auth.users, which is not exposed through the API.
  const admin = adminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    email: emailById.get(r.user_id) ?? "unknown",
    role: r.role as "owner" | "member",
    defaultProfileId: r.default_profile_id ?? null,
    isYou: r.user_id === me.id,
    joinedAt: r.created_at,
  }));
}

/**
 * Add someone to the organization.
 *
 * Creates the account with a password rather than emailing an invite link:
 * Supabase's built-in mailer is rate-limited and needs SMTP configured, and a
 * link that silently never arrives is a worse experience than a password the
 * owner hands over directly. If the address already has an account, it is reused
 * and simply joined to the org.
 */
export async function addMember(
  formData: FormData
): Promise<{ email: string; password: string | null }> {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("Only an owner can add members");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") === "owner" ? "owner" : "member";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");

  const admin = adminClient();

  const { data: existing } = await admin.auth.admin.listUsers();
  let user = (existing?.users ?? []).find((u) => u.email?.toLowerCase() === email);

  // Only a brand-new account gets a password. An existing one keeps its own —
  // joining someone to an org must never silently reset the login they already use.
  let password: string | null = null;

  if (!user) {
    password = generatePassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation round trip; they can sign in at once
    });
    if (error) throw new Error(`Could not create the account: ${error.message}`);
    user = data.user;
  }

  const { error: memErr } = await admin.from("organization_members").upsert(
    { org_id: me.orgId, user_id: user!.id, role },
    { onConflict: "org_id,user_id" }
  );
  if (memErr) throw new Error(`Could not add them to the organization: ${memErr.message}`);

  revalidatePath("/settings");
  // Returned so the owner can pass it on. Never stored anywhere readable.
  return { email, password };
}

export async function removeMember(userId: string) {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("Only an owner can remove members");
  if (userId === me.id) throw new Error("You can't remove yourself");

  const admin = adminClient();

  // Never leave an org with no owner — nobody could then manage members at all.
  const { data: owners } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", me.orgId)
    .eq("role", "owner");
  const target = (owners ?? []).find((o) => o.user_id === userId);
  if (target && (owners ?? []).length <= 1) {
    throw new Error("This is the only owner — make someone else an owner first");
  }

  const { error } = await admin
    .from("organization_members")
    .delete()
    .eq("org_id", me.orgId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  // The auth account is left alone on purpose: removing someone from this org
  // should not delete a login that may belong to other orgs later.
  revalidatePath("/settings");
}

/**
 * Email someone a link that signs them in and lets them set their own password.
 *
 * The link comes from Supabase's admin API but is sent through the organization's
 * own Gmail — the same transport that already delivers invoices. Supabase's
 * built-in mailer is rate-limited to a handful per hour and is development-grade;
 * this path uses infrastructure that is already proven and arrives from an address
 * the recipient recognises.
 *
 * Uses a `recovery` link rather than a magic link so they end up holding a real
 * password instead of needing a fresh link every time they sign in. It lands on
 * /reset-password, which already exists for exactly this.
 */
export async function sendMemberInvite(userId: string): Promise<{ email: string }> {
  const me = await requireMember();
  if (me.role !== "owner") throw new Error("Only an owner can send invites");

  const supabase = await createClient();
  const admin = adminClient();

  // Confirm they're in this org before generating anything for their address.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("org_id", me.orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) throw new Error("That person isn't in your organization");

  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userRes.user?.email) throw new Error("Could not find that account");
  const email = userRes.user.email;

  const { data: org } = await supabase
    .from("organizations").select("name").eq("id", me.orgId).single();
  const orgName = org?.name ?? "the team";

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set — needed to build the sign-in link");

  // generateLink returns the link without Supabase sending anything itself.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${base}/auth/callback?next=/reset-password` },
  });
  if (linkErr || !link?.properties?.action_link) {
    throw new Error(`Could not create the sign-in link: ${linkErr?.message ?? "unknown error"}`);
  }
  const actionLink = link.properties.action_link;

  const { transporter, gmailUser } = await getGmailTransport(supabase, me.orgId);

  await transporter.sendMail({
    from: gmailUser,
    to: email,
    subject: `You've been added to ${orgName} on 7Gence Invoice Maker`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="font-size: 19px; margin: 0 0 6px;">You're in ${escapeHtml(orgName)}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #444;">
          ${escapeHtml(me.email ?? "An owner")} added you to ${escapeHtml(orgName)} on
          7Gence Invoice Maker. Use the button below to set your password and sign in.
        </p>
        <p style="margin: 24px 0;">
          <a href="${actionLink}"
             style="background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;display:inline-block;">
            Set your password
          </a>
        </p>
        <p style="font-size: 12px; color: #777; line-height: 1.6;">
          This link expires in an hour and can only be used once. If it's expired,
          use &ldquo;Forgot?&rdquo; on the sign-in page to get a new one.
        </p>
      </div>
    `,
  });

  return { email };
}

/** Which sender identity this person's invoices default to. */
export async function setMyDefaultProfile(profileId: string | null) {
  const me = await requireMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("organization_members")
    .update({ default_profile_id: profileId })
    .eq("org_id", me.orgId)
    .eq("user_id", me.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/invoices/new");
}
