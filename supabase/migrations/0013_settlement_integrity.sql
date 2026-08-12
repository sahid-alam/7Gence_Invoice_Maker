-- Settlement integrity.
--
-- received_amount/received_currency record what actually landed in the bank, and
-- the dashboard's INR earnings total is built from them. A half-filled pair is a
-- silent money leak: every total filters on BOTH columns being non-null, so a row
-- with an amount but no currency would vanish from the earnings figure while still
-- looking settled in the ledger. Constrain the pair so that cannot happen.

-- Repair first, since a CHECK cannot be added over violating rows.
-- A currency with no amount carries no money — safe to clear.
UPDATE payments
   SET received_currency = NULL
 WHERE received_amount IS NULL
   AND received_currency IS NOT NULL;

-- An amount with no currency DOES carry money, so preserve it. INR is the only
-- default the UI has ever written, so it is the correct reading of these rows.
UPDATE payments
   SET received_currency = 'INR'
 WHERE received_amount IS NOT NULL
   AND received_currency IS NULL;

-- Zero/negative settlements are meaningless; treat as never settled.
UPDATE payments
   SET received_amount = NULL, received_currency = NULL
 WHERE received_amount IS NOT NULL
   AND received_amount <= 0;

-- Normalise so 'inr' and ' INR ' cannot split the earnings total into two buckets.
UPDATE payments
   SET received_currency = upper(trim(received_currency))
 WHERE received_currency IS NOT NULL
   AND received_currency <> upper(trim(received_currency));

ALTER TABLE payments
  ADD CONSTRAINT payments_settlement_pair CHECK (
    (received_amount IS NULL AND received_currency IS NULL)
    OR (received_amount IS NOT NULL AND received_currency IS NOT NULL AND received_amount > 0)
  );

-- The dashboard and payments list both filter by owner + date range.
CREATE INDEX IF NOT EXISTS payments_owner_date_idx ON payments(owner_id, payment_date);
