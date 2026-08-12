// Run: node --test src/lib/wise.test.ts
// Account numbers below are dummies in Wise's real formatting — not live receiving details.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWiseDetails } from "./wise.ts";

const USD = `Here are the USD account details for Sahid Alam on Wise.
If you're sending money from a bank in the US, you can use these details to make a domestic transfer. If you're sending from somewhere else, make an international Swift transfer.

---
Name: Sahid Alam

Account type: Deposit
Use when sending money from the US

Routing number (for wire and ACH): 000000000
Use when sending money from the US

Account number: 111111111111111

Address: Wise US Inc, 108 W 13th St, Wilmington, DE, 19801, United States

Swift/BIC: TRWIUS35XXX
Use when sending money from outside the US
---`;

const GBP = `Here are the GBP account details for Sahid Alam on Wise.

---
Name: Sahid Alam

Account number: 00000000

Sort code: 23-08-01
Use when sending money from the UK

IBAN: GB00 TRWI 0000 0000 0000 00

Swift/BIC: TRWIGB2LXXX

Bank name and address: Wise Payments Limited, 1st Floor, Worship Square, 65 Clifton Street, London, EC2A 4JE, United Kingdom
---`;

test("keeps every labelled field, in order, and drops prose", () => {
  const { currency, name, fields } = parseWiseDetails(USD);
  assert.equal(currency, "USD");
  assert.equal(name, "Sahid Alam");
  assert.deepEqual(fields.map((f) => f.label), [
    "Account type",
    "Routing number (for wire and ACH)",
    "Account number",
    "Address",
    "Swift/BIC",
  ]);
  assert.equal(fields[1].value, "000000000");
  // The "Use when sending money from..." hints must never reach a client-facing invoice.
  assert.ok(!fields.some((f) => /Use when sending/.test(f.value)));
});

test("handles a different currency's field set without per-currency code", () => {
  const { currency, fields } = parseWiseDetails(GBP);
  assert.equal(currency, "GBP");
  assert.deepEqual(fields.map((f) => f.label), [
    "Account number",
    "Sort code",
    "IBAN",
    "Swift/BIC",
    "Bank name and address",
  ]);
  assert.equal(fields[4].value.startsWith("Wise Payments Limited"), true);
});

test("refuses a multi-currency paste instead of silently merging it", () => {
  assert.throws(() => parseWiseDetails(`${USD}\n${GBP}`), /one currency block at a time/);
});
