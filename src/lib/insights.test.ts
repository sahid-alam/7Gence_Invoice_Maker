// Run: node --test src/lib/insights.test.ts
//
// Half of these test that an insight stays SILENT. That is the harder half and the
// one that matters: a panel that fires "88% of income from one client" on a book with
// two clients is not informative, and a reader who learns to ignore the panel gets
// nothing from the ones that are real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slowestPayer, overdueAging, clientConcentration, realisedRateTrend,
  dormantClient, stuckDrafts, unusualAmount, computeInsights,
  type InsightInput, type InsightInvoice, type InsightPayment,
} from "./insights.ts";

const TODAY = "2026-08-13";

let n = 0;
function inv(over: Partial<InsightInvoice> = {}): InsightInvoice {
  n += 1;
  return {
    id: `i${n}`, invoice_number: `INV-${n}`, client_name: "Acme", total: 1000,
    paid_amount: 0, currency: "USD", status: "paid", issue_date: "2026-01-01",
    due_date: "2026-01-31", ...over,
  };
}
function pay(over: Partial<InsightPayment> = {}): InsightPayment {
  n += 1;
  return {
    id: `p${n}`, payer_name: "Acme", total_amount: 1000, currency: "USD",
    received_amount: 85000, received_currency: "INR", payment_date: "2026-01-15",
    received_date: "2026-01-17", ...over,
  };
}
const input = (over: Partial<InsightInput> = {}): InsightInput =>
  ({ today: TODAY, invoices: [], payments: [], links: [], ...over });

// ---------------------------------------------------------------- suppression

test("says nothing at all about empty books", () => {
  assert.deepEqual(computeInsights(input()), []);
});

test("concentration stays quiet below four paying clients", () => {
  // Three clients, one taking 90% — real books, but the finding would just be
  // "you have three clients", which the reader can see.
  const payments = [
    pay({ payer_name: "A", received_amount: 900000 }),
    pay({ payer_name: "B", received_amount: 50000 }),
    pay({ payer_name: "C", received_amount: 50000 }),
  ];
  assert.equal(clientConcentration(input({ payments })), null);

  // A fourth client crosses the bar and the same 90% now reports.
  payments.push(pay({ payer_name: "D", received_amount: 10000 }));
  const got = clientConcentration(input({ payments }));
  assert.ok(got, "should fire once there are four paying clients");
  assert.match(got.title, /% of income comes from A/);
});

test("concentration stays quiet when income is genuinely spread", () => {
  const payments = ["A", "B", "C", "D", "E"].map((c) =>
    pay({ payer_name: c, received_amount: 100000 })
  );
  assert.equal(clientConcentration(input({ payments })), null);
});

test("pay speed needs three invoices from a client and someone to compare against", () => {
  // One slow client with plenty of history, but nobody else — no baseline.
  const invoices = [
    inv({ client_name: "Slow", issue_date: "2026-01-01" }),
    inv({ client_name: "Slow", issue_date: "2026-02-01" }),
    inv({ client_name: "Slow", issue_date: "2026-03-01" }),
  ];
  const payments = [
    pay({ payment_date: "2026-03-01" }),
    pay({ payment_date: "2026-04-01" }),
    pay({ payment_date: "2026-05-01" }),
  ];
  const links = invoices.map((i, k) => ({
    payment_id: payments[k].id, invoice_id: i.id, amount_applied: 1000,
  }));
  assert.equal(slowestPayer(input({ invoices, payments, links })), null);
});

test("pay speed stays quiet when everyone pays at a similar speed", () => {
  const invoices: InsightInvoice[] = [];
  const payments: InsightPayment[] = [];
  const links = [];
  for (const client of ["A", "B"]) {
    for (const month of ["01", "02", "03"]) {
      const i = inv({ client_name: client, issue_date: `2026-${month}-01` });
      const p = pay({ payer_name: client, payment_date: `2026-${month}-11` }); // 10 days each
      invoices.push(i); payments.push(p);
      links.push({ payment_id: p.id, invoice_id: i.id, amount_applied: 1000 });
    }
  }
  assert.equal(slowestPayer(input({ invoices, payments, links })), null);
});

test("an outlier needs four prior invoices from that client before it is an outlier", () => {
  const client = "Nimbus";
  const history = [1000, 1000, 1000].map((t) => inv({ client_name: client, total: t }));
  const big = inv({ client_name: client, total: 9000, status: "sent" });
  assert.equal(unusualAmount(input({ invoices: [...history, big] })), null);

  history.push(inv({ client_name: client, total: 1000 }));
  const got = unusualAmount(input({ invoices: [...history, big] }));
  assert.ok(got, "four paid invoices is enough of a baseline");
  assert.match(got.detail, /9\.0× their median/);
});

test("a realised-rate move needs both enough settlements and enough time", () => {
  // Four settlements, but all inside a fortnight — that is one week's noise.
  const tight = [
    pay({ received_date: "2026-01-01", received_amount: 83000 }),
    pay({ received_date: "2026-01-05", received_amount: 83000 }),
    pay({ received_date: "2026-01-09", received_amount: 83000 }),
    pay({ received_date: "2026-01-14", received_amount: 95000 }),
  ];
  assert.deepEqual(realisedRateTrend(input({ payments: tight })), []);

  // Same rows spread across half a year and the move is worth reporting.
  const spread = [
    pay({ received_date: "2026-01-01", received_amount: 83000 }),
    pay({ received_date: "2026-03-01", received_amount: 83000 }),
    pay({ received_date: "2026-05-01", received_amount: 83000 }),
    pay({ received_date: "2026-07-01", received_amount: 95000 }),
  ];
  const got = realisedRateTrend(input({ payments: spread }));
  assert.equal(got.length, 1);
  assert.equal(got[0].severity, "good", "a better rate is good news, not a warning");
  assert.match(got[0].detail, /₹95\.00/);
});

test("INR payments never produce a realised-rate insight — nothing was converted", () => {
  const rows = ["2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01"].map((d) =>
    pay({ currency: "INR", total_amount: 50000, received_amount: 50000, received_date: d })
  );
  assert.deepEqual(realisedRateTrend(input({ payments: rows })), []);
});

test("a client with one invoice and a long silence is not dormant", () => {
  const invoices = [inv({ client_name: "Once", status: "paid", issue_date: "2025-01-01" })];
  assert.equal(dormantClient(input({ invoices })), null);
});

// ---------------------------------------------------------------- firing

test("overdue aging buckets by how late, and escalates past 60 days", () => {
  const invoices = [
    inv({ status: "sent", total: 2100, due_date: "2026-05-30" }),   // 75 days late
    inv({ status: "sent", total: 4800, due_date: "2026-07-25" }),   // 19 days late
    inv({ status: "partial", total: 3000, paid_amount: 1200, due_date: "2026-07-05" }),
    inv({ status: "sent", total: 999, due_date: "2026-12-01" }),    // not yet due
  ];
  const got = overdueAging(input({ invoices }));
  assert.ok(got);
  assert.equal(got.severity, "attention", "over 60 days late is not a 'watch'");
  assert.match(got.detail, /1 at 61–90 days/);
  assert.match(got.detail, /75 days beyond/);
  assert.match(got.title, /\$8,700 is past due/, "owed, not invoiced — partial nets off");
});

test("no overdue invoices means no overdue insight", () => {
  const invoices = [inv({ status: "sent", due_date: "2026-12-01" }), inv({ status: "paid" })];
  assert.equal(overdueAging(input({ invoices })), null);
});

test("a draft is only stuck once it has sat for a fortnight", () => {
  assert.equal(stuckDrafts(input({ invoices: [inv({ status: "draft", issue_date: "2026-08-10" })] })), null);

  const got = stuckDrafts(input({
    invoices: [inv({ status: "draft", issue_date: "2026-06-10", total: 900, currency: "EUR" })],
  }));
  assert.ok(got);
  assert.match(got.title, /€900 is written up but unsent/);
});

test("drafts are grouped per currency rather than summed across them", () => {
  const got = stuckDrafts(input({
    invoices: [
      inv({ status: "draft", issue_date: "2026-06-10", total: 900, currency: "EUR" }),
      inv({ status: "draft", issue_date: "2026-06-11", total: 1500, currency: "USD" }),
    ],
  }));
  assert.ok(got);
  assert.match(got.title, /\$1,500 · €900/, "biggest first, never added together");
});

test("the slowest payer is reported against the others' median", () => {
  const invoices: InsightInvoice[] = [];
  const payments: InsightPayment[] = [];
  const links: { payment_id: string; invoice_id: string; amount_applied: number }[] = [];
  const add = (client: string, issue: string, paid: string) => {
    const i = inv({ client_name: client, issue_date: issue });
    const p = pay({ payer_name: client, payment_date: paid });
    invoices.push(i); payments.push(p);
    links.push({ payment_id: p.id, invoice_id: i.id, amount_applied: 1000 });
  };
  add("Fast", "2026-01-01", "2026-01-08");
  add("Fast", "2026-02-01", "2026-02-08");
  add("Fast", "2026-03-01", "2026-03-08");
  add("Slow", "2026-01-01", "2026-02-15");   // 45 days
  add("Slow", "2026-02-01", "2026-03-18");   // 45
  add("Slow", "2026-03-01", "2026-04-15");   // 45

  const got = slowestPayer(input({ invoices, payments, links }));
  assert.ok(got);
  assert.match(got.title, /^Slow pays slowest/);
  assert.match(got.detail, /about 45 days, against 7/);
});

test("insights come back most urgent first", () => {
  const invoices = [
    inv({ status: "sent", total: 2100, due_date: "2026-05-30" }),          // attention
    inv({ status: "draft", issue_date: "2026-06-10", total: 900 }),        // attention
  ];
  const payments = ["A", "B", "C", "D"].map((c, k) =>
    pay({ payer_name: c, received_amount: k === 0 ? 900000 : 30000 })
  );
  const got = computeInsights(input({ invoices, payments }));
  assert.ok(got.length >= 3);
  const ranks = got.map((g) => g.severity);
  assert.deepEqual([...ranks].sort((a, b) =>
    ({ attention: 0, watch: 1, good: 2 })[a] - ({ attention: 0, watch: 1, good: 2 })[b]
  ), ranks, "already sorted by urgency");
});

test("every insight carries its evidence, so a reader can judge the claim", () => {
  const invoices = [inv({ status: "sent", total: 2100, due_date: "2026-05-30" })];
  for (const i of computeInsights(input({ invoices }))) {
    assert.ok(i.evidence.length > 0, `${i.id} must say what it was computed from`);
    assert.ok(i.detail.length > 0, `${i.id} must carry its figures`);
  }
});
