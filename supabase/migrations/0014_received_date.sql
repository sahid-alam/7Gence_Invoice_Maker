-- When the rupees actually hit the bank, as distinct from when the client paid.
--
-- These fall in different financial years more often than you'd think: a client
-- pays USDC on 25 March, the P2P sale credits INR on 5 April, and India's FY
-- boundary sits between them. Booking those rupees under the payment date puts
-- them in the wrong year versus the bank statement and the FIRC.
--
-- Both dates are kept because Indian compliance uses them for different things:
--   issue_date    (invoices) -> GST return period, and accrual-basis income
--   payment_date  (payments) -> when the client sent it
--   received_date (payments) -> FIRC / e-BRC date, FEMA realisation clock,
--                               and cash-basis income
--
-- Nullable: a payment that has not been settled yet has no bank date. Earnings
-- fall back to payment_date until one is recorded, so nothing silently drops out
-- of the totals.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS received_date date;

-- received_date only means anything alongside a settled amount.
ALTER TABLE payments
  ADD CONSTRAINT payments_received_date_needs_amount CHECK (
    received_date IS NULL OR received_amount IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS payments_owner_received_date_idx
  ON payments(owner_id, received_date);
