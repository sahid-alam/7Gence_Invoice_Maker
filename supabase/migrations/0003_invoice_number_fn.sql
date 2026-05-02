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
