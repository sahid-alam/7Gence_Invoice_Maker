-- Payments ledger: one row per bank transaction, with split links to invoices

CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_profile_id uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  payer_name        text NOT NULL,
  total_amount      numeric(15,4) NOT NULL CHECK (total_amount > 0),
  currency          text NOT NULL,
  received_amount   numeric(15,4),       -- post-conversion local amount (e.g. ₹41,500 after USDC P2P)
  received_currency text,               -- local currency code (e.g. INR)
  payment_date      date NOT NULL DEFAULT current_date,
  payment_mode      text CHECK (payment_mode IN ('bank_transfer','upi','crypto','cash','cheque','other')),
  reference         text,               -- UTR, UPI ref, "0xabc... | UTR-123" for crypto→P2P
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_invoice_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_applied numeric(15,4) NOT NULL CHECK (amount_applied > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id, invoice_id)
);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner only" ON payments FOR ALL USING (auth.uid() = owner_id);

ALTER TABLE payment_invoice_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner only" ON payment_invoice_links FOR ALL
  USING (
    EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id AND p.owner_id = auth.uid())
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.owner_id = auth.uid())
  );

-- Indexes
CREATE INDEX ON payments(owner_id);
CREATE INDEX ON payments(business_profile_id);
CREATE INDEX ON payments(payment_date);
CREATE INDEX ON payment_invoice_links(payment_id);
CREATE INDEX ON payment_invoice_links(invoice_id);

-- Migrate existing payment_records → new model
INSERT INTO payments (id, owner_id, business_profile_id, payer_name, total_amount, currency, payment_date, notes, created_at)
SELECT pr.id, pr.owner_id, i.business_profile_id, i.client_name, pr.amount, i.currency, pr.payment_date, pr.notes, pr.created_at
FROM payment_records pr
JOIN invoices i ON i.id = pr.invoice_id;

INSERT INTO payment_invoice_links (payment_id, invoice_id, amount_applied, created_at)
SELECT id, invoice_id, amount, created_at
FROM payment_records;

DROP TABLE payment_records;
