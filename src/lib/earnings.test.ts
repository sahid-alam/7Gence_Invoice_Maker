// Run: node --test src/lib/earnings.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEarnings, inSettlementRange, settlementDate } from "./earnings.ts";

const p = (
  total: number,
  currency: string,
  received: number | null = null,
  receivedCurrency: string | null = null
) => ({ total_amount: total, currency, received_amount: received, received_currency: receivedCurrency });

test("sums only what actually landed in INR", () => {
  const e = computeEarnings([
    p(500, "USD", 41500, "INR"),
    p(300, "EUR", 27000, "INR"),
    p(10000, "INR", 10000, "INR"),
  ]);
  assert.equal(e.earnedHome, 78500);
  assert.equal(e.complete, true);
  assert.equal(e.pendingCount, 0);
});

test("never counts an unsettled payment as zero — it reports it as pending", () => {
  const e = computeEarnings([p(500, "USD", 41500, "INR"), p(300, "EUR"), p(200, "USD")]);
  assert.equal(e.earnedHome, 41500);
  assert.equal(e.pendingCount, 2);
  assert.equal(e.complete, false, "must not claim completeness while money is unaccounted for");
  assert.deepEqual(
    e.pending.map((r) => [r.currency, r.amount, r.count]),
    [["EUR", 300, 1], ["USD", 200, 1]]
  );
});

test("money settled into a non-INR account is kept out of the INR total, not lost", () => {
  const e = computeEarnings([p(500, "USD", 41500, "INR"), p(900, "USD", 880, "USD")]);
  assert.equal(e.earnedHome, 41500);
  assert.deepEqual(e.settledOther, [{ currency: "USD", amount: 880, count: 1 }]);
  assert.equal(e.complete, false);
});

test("a half-filled settlement counts as pending rather than silently vanishing", () => {
  // amount with no currency, and currency with no amount
  const e = computeEarnings([p(500, "USD", 41500, null), p(300, "EUR", null, "INR")]);
  assert.equal(e.earnedHome, 0);
  assert.equal(e.pendingCount, 2);
});

test("rejects zero, negative and non-finite settlements", () => {
  const e = computeEarnings([p(500, "USD", 0, "INR"), p(500, "USD", -100, "INR"), p(500, "USD", NaN, "INR")]);
  assert.equal(e.earnedHome, 0);
  assert.equal(e.pendingCount, 3);
});

test("normalises currency case and whitespace so INR doesn't split into buckets", () => {
  const e = computeEarnings([p(1, "USD", 100, "inr"), p(1, "USD", 100, " INR ")]);
  assert.equal(e.earnedHome, 200);
  assert.equal(e.settledOther.length, 0);
});

test("no float drift across many fractional settlements", () => {
  const e = computeEarnings(Array.from({ length: 300 }, () => p(1, "USD", 0.1, "INR")));
  assert.equal(e.earnedHome, 30);
});

test("accepts numeric strings, which is how postgres numeric arrives", () => {
  const e = computeEarnings([
    { total_amount: "500", currency: "USD", received_amount: "41500.50", received_currency: "INR" },
  ]);
  assert.equal(e.earnedHome, 41500.5);
});

test("settlement date is when the money landed, not when the client paid", () => {
  // India FY 2025-26 ends 31 Mar 2026. Client pays 25 Mar, rupees land 5 Apr.
  const fy2025 = { start: "2025-04-01", end: "2026-03-31" };
  const fy2026 = { start: "2026-04-01", end: "2027-03-31" };
  const rows = [
    { ...p(500, "USD", 41500, "INR"), payment_date: "2026-03-25", received_date: "2026-04-05" },
  ];
  assert.equal(inSettlementRange(rows, fy2025).length, 0, "must not book into the year the client paid");
  assert.equal(inSettlementRange(rows, fy2026).length, 1, "books into the year the bank credited");
});

test("an unsettled payment falls back to its payment date so it is never lost", () => {
  const fy2025 = { start: "2025-04-01", end: "2026-03-31" };
  const rows = [{ ...p(500, "USD"), payment_date: "2026-03-25", received_date: null }];
  assert.equal(inSettlementRange(rows, fy2025).length, 1);
  assert.equal(settlementDate(rows[0]), "2026-03-25");
});

test("no FY range selected returns everything untouched", () => {
  const rows = [{ ...p(1, "USD"), payment_date: "2026-03-25" }];
  assert.equal(inSettlementRange(rows, null).length, 1);
});

test("empty range is complete and zero, not broken", () => {
  const e = computeEarnings([]);
  assert.equal(e.earnedHome, 0);
  assert.equal(e.complete, true);
  assert.equal(e.total, 0);
});
