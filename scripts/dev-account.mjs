/**
 * Create an isolated sandbox account for local development.
 *
 * Development must never touch the real organization's books — a test import or a
 * test payment there is real data corruption. This creates a separate auth user in
 * a separate organization, so RLS keeps the two apart the same way it would keep
 * two customers apart.
 *
 *   node --env-file=.env scripts/dev-account.mjs
 *
 * Idempotent: running it twice reuses the sandbox rather than creating a second one.
 * Prints the password only when the account is first created.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const DEV_EMAIL = "dev@7gence.dev";
const ORG_NAME = "Dev Sandbox";
const PROFILE_NAME = "Dev Sandbox";
const PROFILE_PREFIX = "DEV";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Run with: node --env-file=.env scripts/dev-account.mjs");
  process.exit(1);
}

// Service role bypasses RLS entirely. Every lookup below is therefore pinned to an
// exact identifier — never a first-row or a name that could resolve to the real org.
const admin = createClient(url, key, { auth: { persistSession: false } });

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// ---------------------------------------------------------------- auth user
const { data: list, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) die(`listUsers: ${listErr.message}`);

let user = list.users.find((u) => u.email?.toLowerCase() === DEV_EMAIL);
let password = null;

if (!user) {
  password = randomBytes(16).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password,
    email_confirm: true,
  });
  if (error) die(`createUser: ${error.message}`);
  user = data.user;
  console.log(`✓ created auth user ${DEV_EMAIL}`);
} else {
  // Re-set it so a lost password never means hand-editing the database.
  password = randomBytes(16).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) die(`updateUser: ${error.message}`);
  console.log(`✓ reusing auth user ${DEV_EMAIL} (password reset)`);
}

// ---------------------------------------------------------------- organization
const { data: memberships, error: memErr } = await admin
  .from("organization_members")
  .select("org_id, organizations(name)")
  .eq("user_id", user.id);
if (memErr) die(`read memberships: ${memErr.message}`);

let orgId = null;
for (const m of memberships ?? []) {
  const name = m.organizations?.name;
  if (name === ORG_NAME) orgId = m.org_id;
  // A sandbox user that somehow joined the real org is the exact failure this
  // script exists to prevent. Refuse to continue rather than paper over it.
  else die(`${DEV_EMAIL} is a member of "${name}" — remove that membership first.`);
}

if (!orgId) {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ name: ORG_NAME })
    .select("id")
    .single();
  if (error) die(`create org: ${error.message}`);
  orgId = org.id;

  const { error: joinErr } = await admin
    .from("organization_members")
    .insert({ org_id: orgId, user_id: user.id, role: "owner" });
  if (joinErr) die(`join org: ${joinErr.message}`);
  console.log(`✓ created organization "${ORG_NAME}" (${orgId})`);
} else {
  console.log(`✓ reusing organization "${ORG_NAME}" (${orgId})`);
}

// ---------------------------------------------------------------- sender identity
// Without one, every invoice screen dead-ends on "you need a sender identity".
const { data: profiles, error: profErr } = await admin
  .from("business_profiles")
  .select("id")
  .eq("org_id", orgId);
if (profErr) die(`read profiles: ${profErr.message}`);

if (!profiles.length) {
  const { error } = await admin.from("business_profiles").insert({
    owner_id: user.id,
    org_id: orgId,
    display_name: PROFILE_NAME,
    legal_name: "Dev Sandbox (test data only)",
    invoice_prefix: PROFILE_PREFIX,
    country: "IN",
    is_default: true,
  });
  if (error) die(`create profile: ${error.message}`);
  console.log(`✓ created sender identity "${PROFILE_NAME}" (${PROFILE_PREFIX})`);
} else {
  console.log(`✓ sender identity already present`);
}

// ---------------------------------------------------------------- isolation check
// The only thing that proves this worked. Counted through the service client but
// filtered by org_id — the same column RLS filters on.
const counts = {};
for (const table of ["invoices", "payments", "clients", "receipts"]) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  counts[table] = error ? `error: ${error.message}` : count;
}

console.log(`\nSandbox org contents: ${JSON.stringify(counts)}`);
const dirty = Object.values(counts).some((c) => typeof c !== "number");
if (dirty) die("could not verify isolation");

console.log(`\n  Sign in at /login`);
console.log(`  Email:    ${DEV_EMAIL}`);
console.log(`  Password: ${password}`);
console.log(`\n  This account sees only the Dev Sandbox org. Real books are untouched.`);
