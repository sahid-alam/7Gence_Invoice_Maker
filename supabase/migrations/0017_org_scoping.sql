-- Phase 2 + 3 + 4: org_id everywhere, numbering functions fixed, org policies added
-- ALONGSIDE the existing owner_id policies.
--
-- Still safe to run on a live app. Both policy sets are active at once and a row is
-- visible if EITHER passes, so nothing can disappear. owner_id is untouched — it is
-- repurposed as created_by only in a later migration, once the app code has moved.

-- ---------------------------------------------------------------- 1. org_id columns

ALTER TABLE business_profiles     ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE clients               ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payment_methods       ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoices              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoice_items         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE receipts              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payments              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payment_invoice_links ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invoice_events        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE app_settings          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE oauth_tokens          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------- 2. backfill

DO $$
DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE name = '7Gence';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No 7Gence organization found — run 0016 first';
  END IF;

  UPDATE business_profiles     SET org_id = v_org WHERE org_id IS NULL;
  UPDATE clients               SET org_id = v_org WHERE org_id IS NULL;
  UPDATE payment_methods       SET org_id = v_org WHERE org_id IS NULL;
  UPDATE invoices              SET org_id = v_org WHERE org_id IS NULL;
  UPDATE invoice_items         SET org_id = v_org WHERE org_id IS NULL;
  UPDATE receipts              SET org_id = v_org WHERE org_id IS NULL;
  UPDATE payments              SET org_id = v_org WHERE org_id IS NULL;
  UPDATE payment_invoice_links SET org_id = v_org WHERE org_id IS NULL;
  UPDATE invoice_events        SET org_id = v_org WHERE org_id IS NULL;
  UPDATE app_settings          SET org_id = v_org WHERE org_id IS NULL;
  UPDATE oauth_tokens          SET org_id = v_org WHERE org_id IS NULL;
END $$;

ALTER TABLE business_profiles     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE clients               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE payment_methods       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invoices              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invoice_items         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE receipts              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE payments              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE payment_invoice_links ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE invoice_events        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE app_settings          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE oauth_tokens          ALTER COLUMN org_id SET NOT NULL;

-- Every policy below filters on org_id, so every one of these needs an index or
-- each read becomes a sequential scan.
CREATE INDEX IF NOT EXISTS business_profiles_org_idx     ON business_profiles(org_id);
CREATE INDEX IF NOT EXISTS clients_org_idx               ON clients(org_id);
CREATE INDEX IF NOT EXISTS payment_methods_org_idx       ON payment_methods(org_id);
CREATE INDEX IF NOT EXISTS invoices_org_idx              ON invoices(org_id);
CREATE INDEX IF NOT EXISTS invoice_items_org_idx         ON invoice_items(org_id);
CREATE INDEX IF NOT EXISTS receipts_org_idx              ON receipts(org_id);
CREATE INDEX IF NOT EXISTS payments_org_idx              ON payments(org_id);
CREATE INDEX IF NOT EXISTS payment_invoice_links_org_idx ON payment_invoice_links(org_id);
CREATE INDEX IF NOT EXISTS invoice_events_org_idx        ON invoice_events(org_id);

-- Now that business_profiles is org-scoped, a member can point at a default sender.
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_default_profile_fkey
  FOREIGN KEY (default_profile_id) REFERENCES business_profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- 3. numbering RPCs
--
-- These are the reason this migration cannot wait. Both functions authorise with
-- `owner_id = auth.uid()`, so the moment a second person signs in with their own
-- uid, every invoice creation raises 'Profile not found or access denied'. Loud,
-- but total. Authorising on org membership instead fixes it for everyone.
--
-- The UPDATE ... RETURNING remains the atomic counter increment. Do not replace it
-- with a read-then-write, and never with MAX() + 1.

CREATE OR REPLACE FUNCTION next_invoice_number(profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix  text;
  v_counter integer;
  v_year    text;
BEGIN
  UPDATE business_profiles
     SET invoice_counter = invoice_counter + 1,
         updated_at = now()
   WHERE id = profile_id
     AND org_id IN (SELECT private.my_org_ids())
  RETURNING invoice_prefix, invoice_counter INTO v_prefix, v_counter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or access denied';
  END IF;

  v_year := to_char(current_date, 'YYYY');
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_counter::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION next_receipt_number(profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix  text;
  v_counter integer;
  v_year    text;
BEGIN
  UPDATE business_profiles
     SET receipt_counter = receipt_counter + 1,
         updated_at = now()
   WHERE id = profile_id
     AND org_id IN (SELECT private.my_org_ids())
  RETURNING invoice_prefix, receipt_counter INTO v_prefix, v_counter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or access denied';
  END IF;

  v_year := to_char(current_date, 'YYYY');
  RETURN 'REC-' || v_prefix || '-' || v_year || '-' || lpad(v_counter::text, 3, '0');
END;
$$;

-- ---------------------------------------------------------------- 4. org policies
--
-- Added ALONGSIDE the existing owner_id policies, not replacing them. Postgres ORs
-- permissive policies together, so a row passes if either rule allows it. That makes
-- this step reversible: drop these and the app is exactly as it was.

CREATE POLICY "org_all_profiles"        ON business_profiles     FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_clients"         ON clients               FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_payment_methods" ON payment_methods       FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_invoices"        ON invoices              FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_invoice_items"   ON invoice_items         FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_receipts"        ON receipts              FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_payments"        ON payments              FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_links"           ON payment_invoice_links FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_app_settings"    ON app_settings          FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_all_oauth_tokens"    ON oauth_tokens          FOR ALL USING (org_id IN (SELECT private.my_org_ids())) WITH CHECK (org_id IN (SELECT private.my_org_ids()));

-- invoice_events stays append-only: SELECT and INSERT get policies, UPDATE and
-- DELETE deliberately get none, and under RLS an operation with no policy is denied.
CREATE POLICY "org_read_events"   ON invoice_events FOR SELECT USING (org_id IN (SELECT private.my_org_ids()));
CREATE POLICY "org_append_events" ON invoice_events FOR INSERT WITH CHECK (org_id IN (SELECT private.my_org_ids()));
