ALTER TABLE invoices ADD COLUMN IF NOT EXISTS drive_url text;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS drive_url text;
