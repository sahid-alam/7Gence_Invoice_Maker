-- ============================================================
-- 7Gence Invoice Maker — Initial Schema
-- ============================================================

-- ---- ENUMS ----

CREATE TYPE payment_method_type AS ENUM ('bank_transfer', 'crypto_wallet', 'upi');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'void');
CREATE TYPE tax_type AS ENUM ('none', 'cgst_sgst', 'igst', 'custom');

-- ---- BUSINESS PROFILES ----

CREATE TABLE business_profiles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  display_name              text NOT NULL,
  legal_name                text,
  email                     text,
  phone                     text,
  address_line1             text,
  address_line2             text,
  city                      text,
  state                     text,
  country                   text NOT NULL DEFAULT 'IN',
  postal_code               text,

  gstin                     text,
  pan                       text,

  logo_url                  text,

  invoice_prefix            text NOT NULL DEFAULT '7GS',
  invoice_counter           integer NOT NULL DEFAULT 0,
  receipt_counter           integer NOT NULL DEFAULT 0,

  default_currency          text NOT NULL DEFAULT 'USD',
  default_template_id       text NOT NULL DEFAULT 'white-caps',
  default_payment_method_id uuid,

  is_default                boolean NOT NULL DEFAULT false,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON business_profiles(owner_id);

-- ---- CLIENTS ----

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name            text NOT NULL,
  company_name    text,
  email           text,
  phone           text,
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  country         text,
  postal_code     text,

  gstin           text,
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON clients(owner_id);

-- ---- PAYMENT METHODS ----

CREATE TABLE payment_methods (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_profile_id   uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,

  type                  payment_method_type NOT NULL,
  label                 text NOT NULL,
  is_default            boolean NOT NULL DEFAULT false,

  -- bank transfer
  account_holder_name   text,
  bank_name             text,
  account_number        text,
  ifsc_code             text,
  swift_code            text,

  -- crypto wallet
  wallet_address        text,
  network               text,
  coin                  text,
  account_name          text,

  -- upi
  upi_id                text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON payment_methods(business_profile_id);

-- FK back-reference from profiles → default payment method
ALTER TABLE business_profiles
  ADD CONSTRAINT fk_default_payment_method
  FOREIGN KEY (default_payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;

-- ---- INVOICES ----

CREATE TABLE invoices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  business_profile_id       uuid NOT NULL REFERENCES business_profiles(id),
  client_id                 uuid REFERENCES clients(id) ON DELETE SET NULL,

  -- denormalized client snapshot
  client_name               text NOT NULL,
  client_company            text,
  client_email              text,
  client_address            text,
  client_gstin              text,

  invoice_number            text NOT NULL,

  issue_date                date NOT NULL DEFAULT current_date,
  due_date                  date,

  currency                  text NOT NULL DEFAULT 'USD',

  subtotal                  numeric(15,4) NOT NULL DEFAULT 0,

  tax_type                  tax_type NOT NULL DEFAULT 'none',
  tax_rate                  numeric(5,4),
  cgst_rate                 numeric(5,4),
  sgst_rate                 numeric(5,4),
  igst_rate                 numeric(5,4),
  tax_amount                numeric(15,4) NOT NULL DEFAULT 0,

  discount_percent          numeric(5,4) NOT NULL DEFAULT 0,
  discount_amount           numeric(15,4) NOT NULL DEFAULT 0,

  total                     numeric(15,4) NOT NULL DEFAULT 0,

  status                    invoice_status NOT NULL DEFAULT 'draft',

  payment_method_id         uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  payment_method_snapshot   jsonb,

  template_id               text NOT NULL DEFAULT 'white-caps',

  sender_gstin              text,
  sender_state              text,

  notes                     text,
  terms                     text,

  paid_at                   timestamptz,
  paid_amount               numeric(15,4),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON invoices(owner_id);
CREATE INDEX ON invoices(business_profile_id);
CREATE INDEX ON invoices(status);
CREATE INDEX ON invoices(due_date) WHERE status = 'sent';
CREATE UNIQUE INDEX ON invoices(business_profile_id, invoice_number);

-- ---- INVOICE ITEMS ----

CREATE TABLE invoice_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  sort_order      smallint NOT NULL DEFAULT 0,
  description     text NOT NULL,
  quantity        numeric(10,4) NOT NULL DEFAULT 1,
  unit_price      numeric(15,4) NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON invoice_items(invoice_id);

-- ---- RECEIPTS ----

CREATE TABLE receipts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  invoice_id            uuid REFERENCES invoices(id) ON DELETE SET NULL,
  business_profile_id   uuid NOT NULL REFERENCES business_profiles(id),

  receipt_number        text NOT NULL,

  client_name           text NOT NULL,
  client_company        text,
  client_address        text,

  amount                numeric(15,4) NOT NULL,
  currency              text NOT NULL,

  payment_method_snapshot jsonb,

  payment_date          date NOT NULL DEFAULT current_date,

  notes                 text,
  template_id           text NOT NULL DEFAULT 'white-caps',

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON receipts(owner_id);
CREATE INDEX ON receipts(invoice_id);
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
-- ============================================================
-- Atomic invoice/receipt number generation
-- ============================================================

CREATE OR REPLACE FUNCTION next_invoice_number(profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_prefix  text;
  v_counter integer;
  v_year    text;
BEGIN
  UPDATE business_profiles
     SET invoice_counter = invoice_counter + 1,
         updated_at = now()
   WHERE id = profile_id
     AND owner_id = auth.uid()
  RETURNING invoice_prefix, invoice_counter INTO v_prefix, v_counter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or access denied';
  END IF;

  v_year := to_char(current_date, 'YYYY');
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_counter::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION next_receipt_number(profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_prefix  text;
  v_counter integer;
  v_year    text;
BEGIN
  UPDATE business_profiles
     SET receipt_counter = receipt_counter + 1,
         updated_at = now()
   WHERE id = profile_id
     AND owner_id = auth.uid()
  RETURNING invoice_prefix, receipt_counter INTO v_prefix, v_counter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found or access denied';
  END IF;

  v_year := to_char(current_date, 'YYYY');
  RETURN 'REC-' || v_prefix || '-' || v_year || '-' || lpad(v_counter::text, 3, '0');
END;
$$;
-- ============================================================
-- Storage bucket for profile logos
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-logos',
  'profile-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "upload_own_logo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "update_own_logo" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "delete_own_logo" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "public_read_logos" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-logos');
