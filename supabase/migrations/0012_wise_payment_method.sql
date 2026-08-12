-- Wise payment method. Wise hands out a different identifier set per currency
-- (USD routing number, GBP sort code, EUR IBAN, AED Swift-only), so the fields are
-- stored as an ordered [{label, value}] array parsed from the block Wise displays,
-- rather than a column per currency. Beneficiary name stays in account_holder_name.
ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'wise';

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS details jsonb;
