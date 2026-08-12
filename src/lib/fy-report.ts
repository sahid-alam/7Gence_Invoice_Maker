import type { PaymentRow } from "@/lib/earnings";

/**
 * Financial-year arithmetic: bucket settled money by month and compare to last year.
 *
 * Takes its date windows as parameters rather than computing them. `financial-year.ts`
 * owns what a financial year *is* for a given country — duplicating that here would
 * risk the report and the filters disagreeing about which year a payment falls in,
 * which is the one mistake that matters. It also keeps this module free of value
 * imports, so it can be unit-tested directly.
 */

export interface MonthBucket {
  /** YYYY-MM */
  key: string;
  /** "Apr", "May" … for the axis */
  label: string;
  /** INR that reached the bank in this month */
  earned: number;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface FYReportInput {
  startYear: number;
  /** 1 = January. The month the financial year opens on. */
  startMonth: number;
  label: string;
  previousLabel: string;
  range: DateRange;
  previousRange: DateRange;
}

export interface FYReport {
  label: string;
  range: DateRange;
  months: MonthBucket[];
  earned: number;
  /** Null when there is no prior-year data at all — different from earning nothing. */
  previousEarned: number | null;
  previousLabel: string;
  /** Fractional change vs the previous year, or null when there's nothing to compare. */
  change: number | null;
  /** Highest month, for the chart's single direct label. */
  peak: MonthBucket | null;
  paymentCount: number;
}

const HOME_CURRENCY = "INR";
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * The date a payment counts on: when the money reached the bank, falling back to
 * when the client paid while it is unsettled. Mirrors `settlementDate` in
 * earnings.ts — kept in step so the report and the dashboard never disagree.
 */
function dateOf(p: PaymentRow): string {
  return p.received_date || p.payment_date || "";
}

/**
 * The twelve calendar months a financial year spans, in order.
 *
 * Buckets are calendar months even when the year opens mid-month (the UK's 6 April),
 * so the first and last are then partial. That is honest for a shape-of-the-year
 * chart, and the totals below come from the exact range rather than these buckets.
 */
export function monthsInFY(startYear: number, startMonth: number): MonthBucket[] {
  return Array.from({ length: 12 }, (_, i) => {
    const offset = startMonth - 1 + i;
    const m = offset % 12;
    const y = startYear + Math.floor(offset / 12);
    return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: MONTH_NAMES[m], earned: 0 };
  });
}

/** Settled INR only — the same basis as the dashboard's Earned figure. */
function settledInRange(payments: PaymentRow[], range: DateRange): PaymentRow[] {
  return payments.filter((p) => {
    if (p.received_currency?.trim().toUpperCase() !== HOME_CURRENCY) return false;
    const amount = Number(p.received_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const d = dateOf(p);
    return d >= range.start && d <= range.end;
  });
}

export function buildFYReport(payments: PaymentRow[], input: FYReportInput): FYReport {
  const months = monthsInFY(input.startYear, input.startMonth);
  const byKey = new Map(months.map((m) => [m.key, m]));

  const inYear = settledInRange(payments, input.range);
  for (const p of inYear) {
    const bucket = byKey.get(dateOf(p).slice(0, 7));
    if (bucket) bucket.earned += Number(p.received_amount);
  }
  const earned = inYear.reduce((s, p) => s + Number(p.received_amount), 0);

  const prior = settledInRange(payments, input.previousRange);
  // Null rather than zero: "nothing on record last year" and "earned nothing last
  // year" are different claims, and a percentage against zero is meaningless anyway.
  const previousEarned = prior.length
    ? prior.reduce((s, p) => s + Number(p.received_amount), 0)
    : null;

  const earning = months.filter((m) => m.earned > 0);
  const peak = earning.length ? earning.reduce((a, b) => (b.earned > a.earned ? b : a)) : null;

  return {
    label: input.label,
    range: input.range,
    months,
    earned,
    previousEarned,
    previousLabel: input.previousLabel,
    change:
      previousEarned && previousEarned > 0 ? (earned - previousEarned) / previousEarned : null,
    peak,
    paymentCount: inYear.length,
  };
}
