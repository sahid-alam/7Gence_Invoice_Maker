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
