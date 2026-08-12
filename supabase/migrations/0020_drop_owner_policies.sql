-- Phase 6: remove the old single-user policies. Org policies have been live and
-- verified alongside them since 0017, so this only takes away the redundant path.
--
-- This is the first irreversible step. Everything before it could be undone by
-- dropping the org policies; after this, `auth.uid() = owner_id` no longer grants
-- anything and the org policies are the only thing standing between a session and
-- the data. They have been carrying every request in the app for a while now.
--
-- No data is touched. Dropping a policy removes an access rule, never a row.

DROP POLICY IF EXISTS "owner_all_profiles"        ON business_profiles;
DROP POLICY IF EXISTS "owner_all_clients"         ON clients;
DROP POLICY IF EXISTS "owner_all_payment_methods" ON payment_methods;
DROP POLICY IF EXISTS "owner_all_invoices"        ON invoices;
DROP POLICY IF EXISTS "owner_all_invoice_items"   ON invoice_items;
DROP POLICY IF EXISTS "owner_all_receipts"        ON receipts;
DROP POLICY IF EXISTS "owner only"                ON payments;
DROP POLICY IF EXISTS "owner only"                ON payment_invoice_links;
DROP POLICY IF EXISTS "owner reads"               ON invoice_events;
DROP POLICY IF EXISTS "owner appends"             ON invoice_events;
DROP POLICY IF EXISTS "owner only"                ON app_settings;
DROP POLICY IF EXISTS "owner only"                ON oauth_tokens;

-- owner_id is deliberately NOT renamed to created_by here. The rename needs the
-- database and the app to change in lockstep — any gap and every write breaks —
-- and it buys clarity, not behaviour. The column already means "who did this";
-- CLAUDE.md says so. Do it as its own add-column/backfill/drop cycle when there is
-- nothing else in flight.
