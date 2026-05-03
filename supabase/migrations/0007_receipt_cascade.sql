-- Change receipts.invoice_id from ON DELETE SET NULL to ON DELETE CASCADE
-- so deleting an invoice automatically deletes its linked receipt.
ALTER TABLE receipts
  DROP CONSTRAINT IF EXISTS receipts_invoice_id_fkey;

ALTER TABLE receipts
  ADD CONSTRAINT receipts_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
