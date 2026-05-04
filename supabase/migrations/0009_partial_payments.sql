-- Add 'partial' status for invoices that have been partially paid
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partial' AFTER 'sent';

-- Track individual payment events against an invoice
CREATE TABLE IF NOT EXISTS payment_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric(15,4) NOT NULL CHECK (amount > 0),
  payment_date  date NOT NULL DEFAULT current_date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON payment_records(invoice_id);
CREATE INDEX ON payment_records(owner_id);

ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner only" ON payment_records
  FOR ALL USING (auth.uid() = owner_id);
