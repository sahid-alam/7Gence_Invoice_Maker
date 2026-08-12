// Run: node --test src/lib/fy-report.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFYReport, monthsInFY } from "./fy-report.ts";

// India Apr–Mar and a calendar-year jurisdiction, expressed the way the page passes them.
const fy = (startYear: number, startMonth: number) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const range = (y: number) =>
    startMonth === 1
      ? { start: `${y}-01-01`, end: `${y}-12-31` }
      : { start: `${y}-${pad(startMonth)}-01`, end: `${y + 1}-${pad(startMonth - 1)}-31` };
  return {
    startYear, startMonth,
    label: `FY ${startYear}`, previousLabel: `FY ${startYear - 1}`,
    range: range(startYear), previousRange: range(startYear - 1),
  };
};

const pay = (received: number, date: string, currency = "INR") => ({
  total_amount: 100,
  currency: "USD",
  received_amount: received,
  received_currency: currency,
  payment_date: date,
  received_date: date,
});

test("India FY runs Apr → Mar, in that order", () => {
  const m = monthsInFY(2026, 4);
  assert.equal(m.length, 12);
  assert.equal(m[0].label, "Apr");
  assert.equal(m[0].key, "2026-04");
  assert.equal(m[11].label, "Mar");
  assert.equal(m[11].key, "2027-03", "the tail of an Apr–Mar year falls in the next calendar year");
});

test("a calendar-year jurisdiction runs Jan → Dec", () => {
  const m = monthsInFY(2026, 1);
  assert.equal(m[0].key, "2026-01");
  assert.equal(m[11].key, "2026-12");
});

test("buckets money by the month it reached the bank", () => {
  const r = buildFYReport([pay(1000, "2026-04-10"), pay(500, "2026-04-25"), pay(2000, "2026-09-01")], fy(2026, 4));
  assert.equal(r.earned, 3500);
  assert.equal(r.months.find((m) => m.key === "2026-04")!.earned, 1500);
  assert.equal(r.months.find((m) => m.key === "2026-09")!.earned, 2000);
  assert.equal(r.peak!.key, "2026-09");
});

test("excludes anything not settled in INR, matching the dashboard", () => {
  const r = buildFYReport(
    [
      pay(1000, "2026-05-01"),
      pay(900, "2026-05-02", "USD"), // settled into a foreign account
      { ...pay(0, "2026-05-03"), received_amount: null, received_currency: null }, // unsettled
    ],
    fy(2026, 4)
  );
  assert.equal(r.earned, 1000, "only INR that actually landed counts");
  assert.equal(r.paymentCount, 1);
});

test("a payment settling after 31 March lands in the next financial year", () => {
  // Client paid in March, rupees arrived in April.
  const straddler = { ...pay(41500, "2026-04-05"), payment_date: "2026-03-25" };
  assert.equal(buildFYReport([straddler], fy(2025, 4)).earned, 0, "not the year the client paid");
  assert.equal(buildFYReport([straddler], fy(2026, 4)).earned, 41500, "the year the bank credited");
});

test("year-over-year change is computed against the prior year", () => {
  const rows = [pay(100000, "2026-06-01"), pay(80000, "2025-06-01")];
  const r = buildFYReport(rows, fy(2026, 4));
  assert.equal(r.earned, 100000);
  assert.equal(r.previousEarned, 80000);
  assert.equal(Math.round(r.change! * 100), 25);
});

test("no prior year gives null, not a fake 0% or an infinite jump", () => {
  const r = buildFYReport([pay(50000, "2026-06-01")], fy(2026, 4));
  assert.equal(r.previousEarned, null);
  assert.equal(r.change, null);
});

test("an empty year is zero with no peak, not a crash", () => {
  const r = buildFYReport([], fy(2026, 4));
  assert.equal(r.earned, 0);
  assert.equal(r.peak, null);
  assert.equal(r.months.length, 12);
  assert.ok(r.months.every((m) => m.earned === 0));
});
