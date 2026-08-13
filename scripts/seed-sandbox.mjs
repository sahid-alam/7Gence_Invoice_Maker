/**
 * Fill the Dev Sandbox org with eighteen months of realistic books.
 *
 *   node --env-file=.env scripts/seed-sandbox.mjs
 *
 * This is the fixture the insights engine is designed against. Insights only mean
 * anything with enough history behind them — a "88% of revenue from one client"
 * warning is a description of having two clients, not a finding — so the shape here
 * matters as much as the volume: five clients with genuinely different payment
 * behaviour, three currencies, a dormant client, a real overdue tail, and an FX rate
 * that drifts over time so a realised-rate trend has something to say.
 *
 * Destructive, and deliberately so: it wipes the sandbox org's books before seeding
 * so re-running gives identical data. It resolves the org ONLY by its exact name and
 * refuses to touch anything else — the service-role key bypasses RLS, so that guard
 * is the only thing between this and the real organization.
 */
import { createClient } from "@supabase/supabase-js";

const ORG_NAME = "Dev Sandbox";
const TODAY = "2026-08-13";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Run with: node --env-file=.env scripts/seed-sandbox.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

/** days after `iso` */
const plus = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- the books
//
// `pay` is days after issue that the money arrived; `rate` is what one unit of the
// invoice currency actually fetched in rupees that month. Both drift per client on
// purpose: Kakion settles in about a week, Northwind takes six.
const CLIENTS = [
  {
    name: "Kakion Ltd", company: "Kakion Ltd", country: "IE", city: "Cashel",
    email: "accounts@kakion.example", currency: "EUR", tax: "none",
    invoices: [
      { issue: "2025-03-10", amount: 2400, desc: "Kakion OS — discovery", pay: 7, rate: 91.2 },
      { issue: "2025-06-12", amount: 1800, desc: "Kakion OS — phase 1", pay: 9, rate: 92.0 },
      { issue: "2025-09-08", amount: 2400, desc: "Kakion OS — phase 2", pay: 6, rate: 93.4 },
      { issue: "2025-12-15", amount: 3000, desc: "Kakion OS — phase 3", pay: 10, rate: 95.1 },
      { issue: "2026-03-20", amount: 2200, desc: "Inbox triage module", pay: 8, rate: 96.8 },
      { issue: "2026-07-01", amount: 2600, desc: "Agent runtime, sprint 1", pay: 7, unsettled: true },
      { issue: "2026-06-10", amount: 900, desc: "Reporting add-on", draft: true },
    ],
  },
  {
    name: "Northwind Systems", company: "Northwind Systems Inc", country: "US", city: "Austin",
    email: "ap@northwind.example", currency: "USD", tax: "none",
    invoices: [
      { issue: "2025-04-02", amount: 3500, desc: "Data pipeline buildout", pay: 38, rate: 83.1 },
      { issue: "2025-07-15", amount: 4200, desc: "Warehouse migration", pay: 52, rate: 84.6 },
      { issue: "2025-10-20", amount: 3800, desc: "Reporting layer", pay: 41, rate: 86.0 },
      { issue: "2026-01-12", amount: 5000, desc: "Realtime ingest", pay: 49, rate: 87.2 },
      { issue: "2026-04-18", amount: 4400, desc: "Ingest hardening", pay: 44, rate: 88.4 },
      { issue: "2026-06-25", amount: 4800, desc: "Q3 retainer", due: 30 },       // overdue
      { issue: "2026-07-28", amount: 1500, desc: "Ad-hoc analysis", draft: true },
    ],
  },
  {
    name: "Nimbus Analytics Pvt Ltd", company: "Nimbus Analytics Pvt Ltd", country: "IN",
    city: "Bengaluru", state: "Karnataka", email: "finance@nimbus.example",
    currency: "INR", tax: "cgst_sgst", rate_pct: 18,
    invoices: [
      { issue: "2025-05-05", amount: 80000, desc: "Data platform retainer — May", pay: 22 },
      { issue: "2025-08-11", amount: 95000, desc: "Data platform retainer — August", pay: 28 },
      { issue: "2025-11-17", amount: 80000, desc: "Data platform retainer — November", pay: 24 },
      { issue: "2026-02-09", amount: 110000, desc: "Platform rebuild", pay: 31 },
      { issue: "2026-05-14", amount: 95000, desc: "Data platform retainer — May", pay: 26 },
      // 3× their usual size — the anomaly check should notice this one.
      { issue: "2026-08-03", amount: 290000, desc: "Annual platform licence", due: 30 },
    ],
  },
  {
    // Invoiced steadily through mid-2025, then nothing. Dormancy is the insight.
    name: "Harbourline Freight GmbH", company: "Harbourline Freight GmbH", country: "DE",
    city: "Hamburg", email: "buchhaltung@harbourline.example", currency: "EUR", tax: "none",
    invoices: [
      { issue: "2025-03-25", amount: 1500, desc: "Logistics dashboard — scoping", pay: 14, rate: 90.5 },
      { issue: "2025-05-30", amount: 2000, desc: "Logistics dashboard — sprint 1", pay: 18, rate: 91.3 },
      { issue: "2025-07-22", amount: 1750, desc: "Logistics dashboard — sprint 2", pay: 12, rate: 92.1 },
    ],
  },
  {
    name: "Ledger Bay Studio", company: "Ledger Bay Studio LLC", country: "US", city: "Portland",
    email: "hello@ledgerbay.example", currency: "USD", tax: "none",
    invoices: [
      { issue: "2026-02-28", amount: 1250, desc: "Brand refresh, phase two", pay: 33, rate: 87.8 },
      { issue: "2026-04-30", amount: 2100, desc: "Motion system", due: 30 },                 // badly overdue
      { issue: "2026-06-05", amount: 3000, desc: "Design retainer, Q3", due: 30, part: 1200, unsettled: true },
    ],
  },
];

// ---------------------------------------------------------------- resolve the org
const { data: orgs, error: orgErr } = await admin
  .from("organizations").select("id, name").eq("name", ORG_NAME);
if (orgErr) die(`read orgs: ${orgErr.message}`);
if (orgs.length !== 1) die(`expected exactly one "${ORG_NAME}" org, found ${orgs.length}. Run dev-account.mjs first.`);
const orgId = orgs[0].id;

const { data: profiles, error: profErr } = await admin
  .from("business_profiles").select("id, owner_id, invoice_prefix, gstin, state").eq("org_id", orgId);
if (profErr) die(`read profiles: ${profErr.message}`);
if (!profiles.length) die("the sandbox org has no sender profile — run dev-account.mjs first");
const profile = profiles[0];
const ownerId = profile.owner_id;
console.log(`✓ sandbox org ${orgId} · profile ${profile.invoice_prefix}`);

// ---------------------------------------------------------------- wipe
// Scoped to org_id every time. payment_invoice_links, invoice_items and receipts all
// cascade from their parents, so deleting invoices and payments is enough.
for (const table of ["payments", "invoices", "clients"]) {
  const { error } = await admin.from(table).delete().eq("org_id", orgId);
  if (error) die(`clear ${table}: ${error.message}`);
}
console.log("✓ cleared previous sandbox books");

// ---------------------------------------------------------------- seed
let counter = 0;
const invoiceRows = [];
const itemRows = [];
const paymentPlans = [];

for (const c of CLIENTS) {
  const { data: client, error: cErr } = await admin
    .from("clients")
    .insert({
      owner_id: ownerId, org_id: orgId, name: c.name, company_name: c.company,
      email: c.email, city: c.city, state: c.state ?? null, country: c.country,
    })
    .select("id").single();
  if (cErr) die(`create client ${c.name}: ${cErr.message}`);

  for (const inv of c.invoices) {
    counter += 1;
    const number = `${profile.invoice_prefix}-${inv.issue.slice(0, 4)}-${String(counter).padStart(3, "0")}`;
    const ratePct = c.tax === "none" ? 0 : (c.rate_pct ?? 0);
    const taxAmount = Math.round(inv.amount * (ratePct / 100) * 100) / 100;
    const total = Math.round((inv.amount + taxAmount) * 100) / 100;

    const status = inv.draft ? "draft" : inv.pay != null ? "paid" : inv.part ? "partial" : "sent";
    const paidAmount = status === "paid" ? total : status === "partial" ? inv.part : 0;

    invoiceRows.push({
      owner_id: ownerId, org_id: orgId, business_profile_id: profile.id, client_id: client.id,
      client_name: c.name, client_company: c.company, client_email: c.email,
      client_address: [c.city, c.country].filter(Boolean).join(", "),
      invoice_number: number,
      issue_date: inv.issue,
      due_date: inv.draft ? null : plus(inv.issue, inv.due ?? 30),
      currency: c.currency,
      subtotal: inv.amount,
      tax_type: c.tax,
      tax_rate: ratePct / 100,
      cgst_rate: c.tax === "cgst_sgst" ? ratePct / 2 / 100 : null,
      sgst_rate: c.tax === "cgst_sgst" ? ratePct / 2 / 100 : null,
      igst_rate: c.tax === "igst" ? ratePct / 100 : null,
      tax_amount: taxAmount,
      discount_percent: 0, discount_amount: 0,
      total,
      status,
      paid_amount: paidAmount,
      sender_gstin: profile.gstin, sender_state: profile.state,
      template_id: "white-caps",
      _key: number,
    });

    itemRows.push({ _key: number, description: inv.desc, quantity: 1, unit_price: inv.amount });

    if (status === "paid" || status === "partial") {
      const applied = status === "paid" ? total : inv.part;
      const payDate = plus(inv.issue, inv.pay ?? inv.due ?? 30);
      // INR clients settle in rupees directly — what was invoiced is what landed, so
      // there is no conversion step and the realised rate is not a concept.
      // `unsettled` means the client's money moved but the INR credit hasn't been
      // recorded yet. Both settlement columns must then be null together — migration
      // 0013 constrains it, and a half-filled row would vanish from Earned while
      // still looking settled in the ledger. This is what puts the dashboard's
      // "not in this total" block on screen, so the fixture must contain some.
      const rate = c.currency === "INR" ? 1 : inv.rate;
      const settled = !inv.unsettled && rate != null;
      paymentPlans.push({
        _key: number,
        payer_name: c.name,
        total_amount: applied,
        currency: c.currency,
        received_amount: settled ? Math.round(applied * rate * 100) / 100 : null,
        received_currency: settled ? "INR" : null,
        payment_date: payDate,
        // A wire lands a couple of days after it is sent; a UPI credit is same-day.
        received_date: settled ? (c.currency === "INR" ? payDate : plus(payDate, 2)) : null,
        payment_mode: c.currency === "INR" ? "upi" : "bank_transfer",
        applied,
      });
    }
  }
}

const { data: savedInvoices, error: invErr } = await admin
  .from("invoices")
  .insert(invoiceRows.map(({ _key, ...row }) => row))
  .select("id, invoice_number");
if (invErr) die(`insert invoices: ${invErr.message}`);
const idByNumber = new Map(savedInvoices.map((i) => [i.invoice_number, i.id]));

const { error: itemErr } = await admin.from("invoice_items").insert(
  itemRows.map((it) => ({
    invoice_id: idByNumber.get(it._key), owner_id: ownerId, org_id: orgId, sort_order: 0,
    description: it.description, quantity: it.quantity, unit_price: it.unit_price,
  }))
);
if (itemErr) die(`insert items: ${itemErr.message}`);

const { data: savedPayments, error: payErr } = await admin
  .from("payments")
  .insert(paymentPlans.map(({ _key, applied, ...row }) => ({
    ...row, owner_id: ownerId, org_id: orgId, business_profile_id: profile.id,
  })))
  .select("id");
if (payErr) die(`insert payments: ${payErr.message}`);

const { error: linkErr } = await admin.from("payment_invoice_links").insert(
  paymentPlans.map((p, i) => ({
    payment_id: savedPayments[i].id,
    invoice_id: idByNumber.get(p._key),
    amount_applied: p.applied,
    org_id: orgId,
  }))
);
if (linkErr) die(`link payments: ${linkErr.message}`);

// Bump the counter past the seeded series so a hand-made invoice doesn't collide.
await admin.from("business_profiles").update({ invoice_counter: counter })
  .eq("id", profile.id).eq("org_id", orgId);

const byStatus = invoiceRows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
console.log(`✓ ${invoiceRows.length} invoices ${JSON.stringify(byStatus)}`);
const unsettled = paymentPlans.filter((p) => p.received_amount == null).length;
console.log(`✓ ${paymentPlans.length} payments across ${CLIENTS.length} clients (${unsettled} awaiting settlement)`);
console.log(`\n  Signed-in as dev@7gence.dev you should now see 18 months of books.`);
console.log(`  Today for insight purposes is ${TODAY}.`);
