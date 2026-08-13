// Run: node --test src/lib/invoice-extract.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  despace, parseDate, redactBankDetails, extractByPattern, review,
} from "./invoice-extract.ts";

// Exactly what unpdf returns for the real Canva invoice.
const CANVA = `Description
Kakion OS - Phase 1
Bank Details
Account No. 8548799646
IFSC Code KKBK0008077
Bank Name : Kotak Mahindra Bank
Name : Md Anas Zeb
Total
Muhammad Anas Zeb
Bengaluru, India
+916364758004
anas@7gence.com
Amount
€400
€400
24, JUNE 2026
Invoice No. 7GKZInvoiceBilled to:
Kakion Ltd
New Inn
Cashel, Co.Tipperary
Ireland`;

test("reads the real Canva invoice", () => {
  const r = extractByPattern(CANVA);
  assert.equal(r.invoice_number, "7GKZ");
  assert.equal(r.issue_date, "2026-06-24");
  assert.equal(r.client_name, "Kakion Ltd");
  assert.equal(r.currency, "EUR");
  assert.equal(r.total, 400);
  assert.match(r.client_address ?? "", /Cashel/);
});

test("bank details never leave the machine", () => {
  const out = redactBankDetails(CANVA);
  assert.ok(!out.includes("8548799646"), "account number must be gone");
  assert.ok(!out.includes("KKBK0008077"), "IFSC must be gone");
  // The parts an importer actually needs survive.
  assert.ok(out.includes("Kakion Ltd"));
  assert.ok(out.includes("€400"));
  assert.ok(out.includes("Kakion OS - Phase 1"));
});

test("undoes glyph-at-a-time letter spacing", () => {
  assert.equal(despace("K a k i o n  O S  -  P h a s e  1"), "Kakion OS - Phase 1");
  // Ordinary prose is left alone.
  assert.equal(despace("Bank Name : Kotak Mahindra Bank"), "Bank Name : Kotak Mahindra Bank");
});

test("parses the date formats an invoice actually uses", () => {
  assert.equal(parseDate("24, JUNE 2026"), "2026-06-24");
  assert.equal(parseDate("24 June 2026"), "2026-06-24");
  assert.equal(parseDate("June 24, 2026"), "2026-06-24");
  assert.equal(parseDate("2026-06-24"), "2026-06-24");
  assert.equal(parseDate("24/06/2026"), "2026-06-24");
});

test("refuses an ambiguous day/month rather than guessing", () => {
  // 06/07/2026 is June 7th or 7th June depending on where you are. A wrong invoice
  // date is worse than an empty field the reviewer has to fill in.
  assert.equal(parseDate("06/07/2026"), null);
});

/** A complete extraction, so each test below varies only the field it is about. */
const base = {
  invoice_number: "X1", issue_date: "2026-01-01", due_date: null, client_name: "A",
  client_address: null, currency: "EUR", subtotal: null, tax_rate: null, tax_type: null, total: 400,
  items: [{ description: "work", quantity: 2, unit_price: 200 }],
};

test("flags line items that do not add up", () => {
  const r = review({ ...base, items: [{ description: "work", quantity: 1, unit_price: 4 }] }, "ai");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /add up to 4\.00 but the invoice reads 400\.00/);
});

test("does not flag a correct invoice", () => {
  const r = review(base, "pattern");
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.missing, []);
});

test("a GST invoice reconciles against the subtotal, not the tax-inclusive total", () => {
  // 400 of work + 18% GST = 472. Comparing the lines against 472 would call every
  // correct Indian invoice broken.
  const r = review(
    { ...base, subtotal: 400, tax_rate: 18, total: 472,
      items: [{ description: "work", quantity: 1, unit_price: 400 }] },
    "pattern"
  );
  assert.deepEqual(r.warnings, []);
});

test("warns when tax was found but the lines were filled from the total", () => {
  const r = review(
    { ...base, subtotal: null, tax_rate: 18, total: 472,
      items: [{ description: "work", quantity: 1, unit_price: 472 }] },
    "pattern"
  );
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /18% tax but no subtotal/);
});

test("names what it could not find, so the caller knows to ask the model", () => {
  const r = review(
    {
      invoice_number: null, issue_date: null, due_date: null, client_name: null,
      client_address: null, currency: null, subtotal: null, tax_rate: null, tax_type: null,
      total: null, items: [],
    },
    "pattern"
  );
  assert.deepEqual(r.missing.sort(), ["client", "currency", "date", "invoice number", "line items", "total"]);
});

test("reads a GST invoice's subtotal and rate out of concatenated text", () => {
  const r = extractByPattern(
    `Invoice No. 7GS-2026-004Billed to:
Acme Pvt Ltd
Bengaluru
Description
Retainer, August
2026-08-01
Subtotal₹50,000.00CGST 9%₹4,500.00SGST 9%₹4,500.00
Total₹59,000.00`
  );
  assert.equal(r.subtotal, 50000);
  assert.equal(r.total, 59000);
  assert.equal(r.tax_rate, 18, "CGST 9% + SGST 9% is an 18% invoice");
  assert.equal(r.tax_type, "cgst_sgst", "the split must survive, not flatten to a flat rate");
  assert.equal(r.items[0].unit_price, 50000, "the line is the pre-tax figure");
  assert.deepEqual(review(r, "pattern").warnings, []);
});

test("reads a labelled due date but ignores an unlabelled second date", () => {
  const withDue = extractByPattern("Invoice No. A1\n2026-06-24\nDue Date: 2026-07-24");
  assert.equal(withDue.issue_date, "2026-06-24");
  assert.equal(withDue.due_date, "2026-07-24");

  const without = extractByPattern("Invoice No. A1\n2026-06-24\nDelivered 2026-07-01");
  assert.equal(without.due_date, null);
});

test("an unrecognised layout returns nulls, never invented values", () => {
  const r = extractByPattern("Thanks for your business!\nSee you next month.");
  assert.equal(r.invoice_number, null);
  assert.equal(r.client_name, null);
  assert.equal(r.total, null);
  assert.deepEqual(r.items, []);
});
