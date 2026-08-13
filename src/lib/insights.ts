/**
 * What the books actually say — computed, never guessed.
 *
 * Every figure a person reads on the dashboard is arithmetic over their own rows.
 * A language model may later put a sentence around these, but it is never the source
 * of a number: a hallucinated rupee figure in a ledger is worse than no figure, and
 * there is nothing here a model does better than `reduce`.
 *
 * The hard part is not computing them, it is **knowing when to stay quiet**. On a
 * book with two clients, "88% of revenue comes from one client" is not a finding, it
 * is a restatement of having two clients. Every function below returns `null` until
 * it has enough evidence to say something the reader doesn't already know, and the
 * thresholds live here rather than in the UI so they can be tested. A panel that is
 * mostly empty in month one and fills in over a year is behaving correctly.
 *
 * No value imports, so `node --test` can run it directly.
 */

export type Severity = "attention" | "watch" | "good";

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  /** One sentence, carrying the exact figures. */
  detail: string;
  /** What it was computed from, so the reader can judge the claim. */
  evidence: string;
  href?: string;
  /** Optional headline figure for the card. */
  metric?: { value: string; caption: string };
}

export interface InsightInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  paid_amount: number | null;
  currency: string;
  status: string;
  issue_date: string;
  due_date: string | null;
}

export interface InsightPayment {
  id: string;
  payer_name: string;
  total_amount: number;
  currency: string;
  received_amount: number | null;
  received_currency: string | null;
  payment_date: string;
  received_date: string | null;
}

export interface InsightLink {
  payment_id: string;
  invoice_id: string;
  amount_applied: number;
}

export interface InsightInput {
  today: string;
  invoices: InsightInvoice[];
  payments: InsightPayment[];
  links: InsightLink[];
}

// ---------------------------------------------------------------- thresholds
//
// Each is the point past which a statement stops being noise. They are deliberately
// conservative: a quiet panel costs nothing, a panel that cries wolf on month one
// teaches the reader to stop looking.

/** Paid invoices from one client before its payment speed means anything. */
const MIN_INVOICES_FOR_PAY_SPEED = 3;
/** A client is only "slow" if it is this many days past the others' typical lag. */
const SLOW_PAYER_DAYS = 14;
/** Distinct paying clients before a concentration share is worth reporting. */
const MIN_CLIENTS_FOR_CONCENTRATION = 4;
/** Share of settled income from one client that counts as concentration risk. */
const CONCENTRATION_SHARE = 0.4;
/** Settlements in one currency before a realised-rate trend is a trend. */
const MIN_SETTLEMENTS_FOR_RATE = 4;
/** Days the rate history must span, so a busy month isn't mistaken for a trend. */
const MIN_RATE_SPAN_DAYS = 120;
/** Move in the realised rate worth mentioning. */
const RATE_MOVE = 0.03;
/** Invoices from a client before its silence counts as dormancy. */
const MIN_INVOICES_FOR_DORMANCY = 2;
/** Days without an invoice before a former client is called dormant. */
const DORMANT_DAYS = 120;
/** Days a draft may sit before it is probably forgotten. */
const STALE_DRAFT_DAYS = 14;
/** Prior invoices from a client before an outlier can be judged an outlier. */
const MIN_INVOICES_FOR_OUTLIER = 4;
/** Multiple of a client's usual invoice that counts as unusual. */
const OUTLIER_MULTIPLE = 2.5;

// ---------------------------------------------------------------- small helpers

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Money for a card. Not `formatCurrency` — this file stays import-free so it can be
 * unit-tested directly, so the symbols are duplicated. Keep this table in step with
 * `CURRENCY_SYMBOLS` in types/app.types.ts, or an overdue USDT invoice reads
 * "USDT 1200" on this one surface and "₮1,200" on every other.
 */
function money(amount: number, currency: string): string {
  const n = Math.round(amount).toLocaleString("en-IN");
  const symbol: Record<string, string> = {
    INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ", USDT: "₮",
  };
  return `${symbol[currency] ?? `${currency} `}${n}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** An invoice is overdue when it is still owed and its due date has passed. */
function isOverdue(inv: InsightInvoice, today: string): boolean {
  return (
    (inv.status === "sent" || inv.status === "partial") &&
    inv.due_date != null &&
    inv.due_date < today
  );
}

/**
 * When each invoice was fully settled, by joining links to payment dates.
 * An invoice paid across several payments is dated by the last one — that is when
 * it stopped being a receivable.
 */
function settledOn(input: InsightInput): Map<string, string> {
  const paymentDate = new Map(input.payments.map((p) => [p.id, p.payment_date]));
  const out = new Map<string, string>();
  for (const l of input.links) {
    const d = paymentDate.get(l.payment_id);
    if (!d) continue;
    const existing = out.get(l.invoice_id);
    if (!existing || d > existing) out.set(l.invoice_id, d);
  }
  return out;
}

// ---------------------------------------------------------------- the insights

/**
 * Which client takes longest to pay, measured against the others.
 *
 * Reported as a median rather than a mean: one invoice that sat over a holiday
 * would drag an average and misrepresent the relationship.
 */
export function slowestPayer(input: InsightInput): Insight | null {
  const paidOn = settledOn(input);
  const byClient = new Map<string, number[]>();

  for (const inv of input.invoices) {
    const paid = paidOn.get(inv.id);
    if (!paid || inv.status !== "paid") continue;
    const lag = daysBetween(inv.issue_date, paid);
    if (lag < 0) continue;
    byClient.set(inv.client_name, [...(byClient.get(inv.client_name) ?? []), lag]);
  }

  const eligible = Array.from(byClient.entries()).filter(
    ([, lags]) => lags.length >= MIN_INVOICES_FOR_PAY_SPEED
  );
  // Comparing one client against itself says nothing — a baseline needs someone else.
  if (eligible.length < 2) return null;

  const ranked = eligible
    .map(([client, lags]) => ({ client, days: median(lags), n: lags.length }))
    .sort((a, b) => b.days - a.days);

  const worst = ranked[0];
  const others = median(ranked.slice(1).map((r) => r.days));
  if (worst.days - others < SLOW_PAYER_DAYS) return null;

  return {
    id: "slowest-payer",
    severity: "watch",
    title: `${worst.client} pays slowest`,
    detail: `They settle in about ${Math.round(worst.days)} days, against ${Math.round(others)} for everyone else. Worth shorter terms or a deposit on the next one.`,
    evidence: `median of ${plural(worst.n, "paid invoice")}`,
    metric: { value: `${Math.round(worst.days)}d`, caption: "typical time to pay" },
    href: "/invoices?status=paid",
  };
}

/** How old the money you are owed is, in the buckets a collections call uses. */
export function overdueAging(input: InsightInput): Insight | null {
  const overdue = input.invoices.filter((i) => isOverdue(i, input.today));
  if (!overdue.length) return null;

  const buckets = { "0–30": 0, "31–60": 0, "61–90": 0, "90+": 0 };
  let worstDays = 0;
  const byCurrency = new Map<string, number>();

  for (const inv of overdue) {
    const late = daysBetween(inv.due_date!, input.today);
    worstDays = Math.max(worstDays, late);
    const key = late <= 30 ? "0–30" : late <= 60 ? "31–60" : late <= 90 ? "61–90" : "90+";
    buckets[key] += 1;
    const owed = inv.total - (inv.paid_amount ?? 0);
    byCurrency.set(inv.currency, (byCurrency.get(inv.currency) ?? 0) + owed);
  }

  const amounts = Array.from(byCurrency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => money(amount, currency))
    .join(" · ");
  const spread = Object.entries(buckets)
    .filter(([, n]) => n > 0)
    .map(([range, n]) => `${n} at ${range} days`)
    .join(", ");

  return {
    id: "overdue-aging",
    severity: worstDays > 60 ? "attention" : "watch",
    title: `${amounts} is past due`,
    detail: `${spread}. The oldest has been outstanding ${worstDays} days beyond its due date.`,
    evidence: `${plural(overdue.length, "overdue invoice")}`,
    metric: { value: `${worstDays}d`, caption: "oldest overdue" },
    href: "/invoices?status=overdue",
  };
}

/**
 * How much of the income actually landed depends on one client.
 *
 * Only meaningful once there are enough clients that the share could plausibly be
 * spread — below that it measures the size of the client list, not the risk.
 */
export function clientConcentration(input: InsightInput): Insight | null {
  const settled = input.payments.filter(
    (p) => p.received_amount != null && p.received_currency === "INR"
  );
  const byClient = new Map<string, number>();
  for (const p of settled) {
    byClient.set(p.payer_name, (byClient.get(p.payer_name) ?? 0) + Number(p.received_amount));
  }
  if (byClient.size < MIN_CLIENTS_FOR_CONCENTRATION) return null;

  const total = Array.from(byClient.values()).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const [client, amount] = Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])[0];
  const share = amount / total;
  if (share < CONCENTRATION_SHARE) return null;

  return {
    id: "concentration",
    severity: share >= 0.6 ? "attention" : "watch",
    title: `${Math.round(share * 100)}% of income comes from ${client}`,
    detail: `${money(amount, "INR")} of ${money(total, "INR")} settled. Losing them would take most of the year's income with it.`,
    evidence: `${plural(byClient.size, "paying client")}, ${plural(settled.length, "settlement")}`,
    metric: { value: `${Math.round(share * 100)}%`, caption: "largest client share" },
    href: "/clients",
  };
}

/**
 * What a unit of foreign currency has actually been fetching in rupees.
 *
 * This is the number a exporter feels and never sees: the invoice says 500 USD both
 * times, but one landed at ₹83 and the next at ₹88. Computed from what reached the
 * bank, so it is the realised rate, not a market quote.
 */
export function realisedRateTrend(input: InsightInput): Insight[] {
  const byCurrency = new Map<string, InsightPayment[]>();
  for (const p of input.payments) {
    if (p.received_amount == null || p.received_currency !== "INR") continue;
    if (p.currency === "INR") continue;                 // no conversion happened
    byCurrency.set(p.currency, [...(byCurrency.get(p.currency) ?? []), p]);
  }

  const out: Insight[] = [];
  for (const [currency, rows] of Array.from(byCurrency.entries())) {
    if (rows.length < MIN_SETTLEMENTS_FOR_RATE) continue;

    const dated = rows
      .map((p) => ({
        date: p.received_date ?? p.payment_date,
        rate: Number(p.received_amount) / Number(p.total_amount),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (daysBetween(dated[0].date, dated[dated.length - 1].date) < MIN_RATE_SPAN_DAYS) continue;

    // Compare the most recent settlement against the median of what came before, so
    // one unusual conversion can't invent a trend on its own.
    const latest = dated[dated.length - 1];
    const before = median(dated.slice(0, -1).map((d) => d.rate));
    const move = (latest.rate - before) / before;
    if (Math.abs(move) < RATE_MOVE) continue;

    const better = move > 0;
    out.push({
      id: `realised-rate-${currency}`,
      severity: better ? "good" : "watch",
      title: `${currency} is settling ${better ? "higher" : "lower"} than usual`,
      detail: `Your last ${currency} payment converted at ₹${latest.rate.toFixed(2)}, against a usual ₹${before.toFixed(2)} — ${better ? "up" : "down"} ${Math.abs(Math.round(move * 100))}%. On a ${money(1000, currency)} invoice that is ${money(Math.abs(latest.rate - before) * 1000, "INR")}.`,
      evidence: `${plural(dated.length, "settlement")} in ${currency}`,
      metric: { value: `₹${latest.rate.toFixed(2)}`, caption: `per ${currency}, last settled` },
      href: "/payments",
    });
  }
  return out;
}

/** A client you used to invoice regularly and have not billed in months. */
export function dormantClient(input: InsightInput): Insight | null {
  const byClient = new Map<string, { count: number; last: string }>();
  for (const inv of input.invoices) {
    if (inv.status === "void" || inv.status === "draft") continue;
    const prev = byClient.get(inv.client_name);
    byClient.set(inv.client_name, {
      count: (prev?.count ?? 0) + 1,
      last: prev && prev.last > inv.issue_date ? prev.last : inv.issue_date,
    });
  }

  const dormant = Array.from(byClient.entries())
    .filter(([, v]) => v.count >= MIN_INVOICES_FOR_DORMANCY)
    .map(([client, v]) => ({ client, ...v, silent: daysBetween(v.last, input.today) }))
    .filter((c) => c.silent >= DORMANT_DAYS)
    .sort((a, b) => b.count - a.count || b.silent - a.silent);

  if (!dormant.length) return null;
  const top = dormant[0];
  const months = Math.floor(top.silent / 30);

  return {
    id: "dormant-client",
    severity: "watch",
    title: `${top.client} has gone quiet`,
    detail: `${plural(top.count, "invoice")} between you, but nothing since ${top.last} — ${plural(months, "month")} ago.${dormant.length > 1 ? ` ${dormant.length - 1} other ${dormant.length === 2 ? "client is" : "clients are"} quiet too.` : ""}`,
    evidence: `last invoiced ${top.last}`,
    metric: { value: `${months}mo`, caption: "since last invoice" },
    href: "/clients",
  };
}

/** Work that was written up and then never sent. */
export function stuckDrafts(input: InsightInput): Insight | null {
  const stale = input.invoices.filter(
    (i) => i.status === "draft" && daysBetween(i.issue_date, input.today) >= STALE_DRAFT_DAYS
  );
  if (!stale.length) return null;

  const byCurrency = new Map<string, number>();
  for (const d of stale) byCurrency.set(d.currency, (byCurrency.get(d.currency) ?? 0) + d.total);
  const amounts = Array.from(byCurrency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c, a]) => money(a, c))
    .join(" · ");
  const oldest = stale.reduce((a, b) => (a.issue_date < b.issue_date ? a : b));

  return {
    id: "stuck-drafts",
    severity: "attention",
    title: `${amounts} is written up but unsent`,
    detail: `${plural(stale.length, "draft has", "drafts have")} been sitting for over ${STALE_DRAFT_DAYS} days. The oldest, ${oldest.invoice_number} for ${oldest.client_name}, dates from ${oldest.issue_date}.`,
    evidence: `${plural(stale.length, "draft invoice")}`,
    metric: { value: String(stale.length), caption: "unsent drafts" },
    href: "/invoices?status=draft",
  };
}

/**
 * An open invoice far larger than that client's usual — worth a second look before
 * chasing it, because it is also the shape a typo makes.
 */
export function unusualAmount(input: InsightInput): Insight | null {
  const history = new Map<string, number[]>();
  for (const inv of input.invoices) {
    if (inv.status !== "paid") continue;
    history.set(inv.client_name, [...(history.get(inv.client_name) ?? []), inv.total]);
  }

  const open = input.invoices.filter((i) => i.status === "sent" || i.status === "partial");
  for (const inv of open) {
    const past = history.get(inv.client_name);
    if (!past || past.length < MIN_INVOICES_FOR_OUTLIER) continue;
    const usual = median(past);
    if (usual <= 0 || inv.total < usual * OUTLIER_MULTIPLE) continue;

    return {
      id: "unusual-amount",
      severity: "watch",
      title: `${inv.invoice_number} is much larger than usual`,
      detail: `${money(inv.total, inv.currency)} against a usual ${money(usual, inv.currency)} for ${inv.client_name} — ${(inv.total / usual).toFixed(1)}× their median. Worth confirming the figure before chasing it.`,
      evidence: `median of ${plural(past.length, "past invoice")}`,
      metric: { value: `${(inv.total / usual).toFixed(1)}×`, caption: "their usual invoice" },
      href: `/invoices/${inv.id}`,
    };
  }
  return null;
}

/**
 * Everything worth saying, most urgent first.
 *
 * Callers should render an empty list as "nothing needs attention", not as a failure
 * — silence is the correct output for books in good order.
 */
export function computeInsights(input: InsightInput): Insight[] {
  const rank: Record<Severity, number> = { attention: 0, watch: 1, good: 2 };
  const found = [
    overdueAging(input),
    stuckDrafts(input),
    unusualAmount(input),
    clientConcentration(input),
    slowestPayer(input),
    dormantClient(input),
    ...realisedRateTrend(input),
  ].filter((i): i is Insight => i !== null);

  return found.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
