-- Activity trail per invoice.
--
-- Motivated by un-send: once an invoice can go sent -> draft -> sent again, the
-- status column alone no longer tells you what happened to it. For an export
-- business this also matters at audit time — "why does the client's copy differ
-- from the one in Drive" is answerable only if the revisions are recorded.
--
-- Append-only by policy: select and insert are granted, update and delete are
-- not, so history cannot be quietly rewritten from the app.

CREATE TABLE IF NOT EXISTS invoice_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type       text NOT NULL,
  -- Free-form context for the event: amounts, recipient, old/new values.
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_events_invoice_idx ON invoice_events(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_events_owner_idx ON invoice_events(owner_id);

ALTER TABLE invoice_events ENABLE ROW LEVEL SECURITY;

-- Read your own history.
CREATE POLICY "owner reads" ON invoice_events
  FOR SELECT USING (auth.uid() = owner_id);

-- Append your own history. Deliberately no UPDATE or DELETE policy — with RLS on,
-- an operation without a policy is denied, which is what makes this append-only.
-- (Rows still disappear if the invoice itself is deleted, via the cascade above.)
CREATE POLICY "owner appends" ON invoice_events
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
