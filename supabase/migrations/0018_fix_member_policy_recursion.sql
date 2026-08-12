-- Fix: infinite recursion in the organization_members policy.
--
-- 0016 wrote the owner check as an inline EXISTS against organization_members,
-- inside a policy ON organization_members. Postgres re-enters the policy to
-- evaluate the subquery and recurses:
--   "infinite recursion detected in policy for relation organization_members"
--
-- Same fix as my_org_ids(): move the lookup into a SECURITY DEFINER function so it
-- runs as the definer and is not itself subject to RLS.
--
-- Also splits the write rules off from SELECT. The old policy was FOR ALL, which
-- meant it participated in reads too; membership reads are already covered by
-- "read own membership" and "read org teammates", so writes should say so explicitly.

CREATE OR REPLACE FUNCTION private.is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_members
     WHERE org_id = p_org_id
       AND user_id = (SELECT auth.uid())
       AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION private.is_org_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.is_org_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS "owners manage members" ON organization_members;

CREATE POLICY "owners add members" ON organization_members
  FOR INSERT WITH CHECK ((SELECT private.is_org_owner(org_id)));

CREATE POLICY "owners change members" ON organization_members
  FOR UPDATE USING ((SELECT private.is_org_owner(org_id)))
         WITH CHECK ((SELECT private.is_org_owner(org_id)));

CREATE POLICY "owners remove members" ON organization_members
  FOR DELETE USING ((SELECT private.is_org_owner(org_id)));
