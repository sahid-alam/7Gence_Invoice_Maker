-- Organizations and members. Phase 1 of the shared-login → org migration.
--
-- Purely additive: nothing existing reads these tables yet, and no policy on any
-- existing table changes. The running app is unaffected by this migration.
--
-- People log in as people. An organization is the tenant that scopes data; a
-- business_profile stays what it always was — the sender identity on an invoice.

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  -- The sender identity this person invoices under by default. Nullable: a member
  -- need not have one, and the FK is added in 0017 once business_profiles is
  -- org-scoped. Two roles only — add more when something actually needs them.
  default_profile_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS organization_members_org_idx  ON organization_members(org_id);

-- ---------------------------------------------------------------- membership helper
--
-- Lives in a schema that is NOT exposed through PostgREST, so it cannot be called
-- over the API — only from inside policies.
--
-- SECURITY DEFINER is what stops the classic recursion: a policy on
-- organization_members that queries organization_members would recurse forever.
-- Running as the definer bypasses RLS on the tables the function reads.
--
-- Note: EXECUTE is granted to `authenticated`. RLS policy expressions are evaluated
-- with the *calling* role's privileges, so revoking EXECUTE from authenticated would
-- make every policy that calls this function fail. Schema isolation is what provides
-- the protection here, not the revoke.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.my_org_ids()
RETURNS setof uuid
LANGUAGE sql
SECURITY DEFINER
STABLE                      -- evaluated once per statement, not once per row
SET search_path = ''
AS $$
  SELECT org_id
    FROM public.organization_members
   -- The identity check must live inside the function: SECURITY DEFINER bypasses
   -- RLS on everything it touches, so this is the only thing scoping the result.
   WHERE user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.my_org_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION private.my_org_ids() TO authenticated;

-- ---------------------------------------------------------------- RLS

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read their orgs" ON organizations
  FOR SELECT USING (id IN (SELECT private.my_org_ids()));

-- Reading your OWN membership needs no helper — matching on user_id directly is
-- non-recursive, and it is what bootstraps a session before anything else is known.
CREATE POLICY "read own membership" ON organization_members
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Seeing your teammates does need the helper.
CREATE POLICY "read org teammates" ON organization_members
  FOR SELECT USING (org_id IN (SELECT private.my_org_ids()));

-- Only an owner may add, change or remove members. Writes go through Server Actions
-- but the rule belongs in the database, not only in application code.
CREATE POLICY "owners manage members" ON organization_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members m
       WHERE m.org_id = organization_members.org_id
         AND m.user_id = (SELECT auth.uid())
         AND m.role = 'owner'
    )
  );

-- ---------------------------------------------------------------- backfill
--
-- One org for the existing data, with the current shared account as its owner.
-- The user is derived from the data rather than hardcoded, so this is portable
-- across environments.
DO $$
DECLARE
  v_org  uuid;
  v_user uuid;
BEGIN
  SELECT owner_id INTO v_user FROM business_profiles LIMIT 1;
  IF v_user IS NULL THEN
    SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RAISE NOTICE 'No users found — skipping backfill. Create the org manually.';
    RETURN;
  END IF;

  SELECT id INTO v_org FROM organizations WHERE name = '7Gence';
  IF v_org IS NULL THEN
    INSERT INTO organizations (name) VALUES ('7Gence') RETURNING id INTO v_org;
  END IF;

  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (v_org, v_user, 'owner')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';
END $$;
