-- ============================================================
-- Row Level Security Policies
-- ============================================================

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- business_profiles
CREATE POLICY "owner_all_profiles" ON business_profiles
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- clients
CREATE POLICY "owner_all_clients" ON clients
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- payment_methods
CREATE POLICY "owner_all_payment_methods" ON payment_methods
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- invoices
CREATE POLICY "owner_all_invoices" ON invoices
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- invoice_items
CREATE POLICY "owner_all_invoice_items" ON invoice_items
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- receipts
CREATE POLICY "owner_all_receipts" ON receipts
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
