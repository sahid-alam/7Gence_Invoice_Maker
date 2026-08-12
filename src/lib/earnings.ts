/**
 * Earnings roll-up.
 *
 * The rule this file exists to enforce: **the INR total is real money that reached
 * the bank.** It is never derived from an FX rate, and it is never allowed to look
 * complete when it isn't. Anything not yet settled comes back alongside the total
 * so the UI can show what the number is missing.
 *
 * A payment has two sides:
 *   total_amount / currency        — what the client sent (e.g. 500 USD)
 *   received_amount / received_currency — what actually landed (e.g. 41,500 INR)
 *
 * Only the second side is earnings. The first is an invoice fact.
 */

export const HOME_CURRENCY = "INR";

/** Money is held to 4dp in Postgres; work in integers to avoid float drift. */
const SCALE = 10000;
const toInt = (n: number) => Math.round(n * SCALE);
const fromInt = (n: number) => n / SCALE;

export interface PaymentRow {
  total_amount: number | string;
  currency: string;
  received_amount: number | string | null;
  received_currency: string | null;
  payment_date?: string;
  received_date?: string | null;
}

/**
 * The date a payment belongs to for earnings purposes: when the money actually
 * reached the bank, falling back to when the client paid while it is unsettled.
 *
 * This is what keeps a late-March payment that settles in early April out of the
 * wrong financial year. It matches the date on the FIRC / e-BRC, which is what a
 * CA reconciles the cash-basis figure against. Accrual-basis and GST questions
 * are answered by the invoice's issue_date instead, not by this.
 */
export function settlementDate(p: { payment_date?: string; received_date?: string | null }): string {
  return p.received_date || p.payment_date || "";
}

/** FY-window filter that uses the settlement date rather than the payment date. */
export function inSettlementRange<T extends { payment_date?: string; received_date?: string | null }>(
  rows: T[],
  range: { start: string; end: string } | null
): T[] {
  if (!range) return rows;
  return rows.filter((p) => {
    const d = settlementDate(p);
    return d >= range.start && d <= range.end;
  });
}

export interface CurrencyTotal {
  currency: string;
  amount: number;
  count: number;
}

export interface Earnings {
  /** Exact INR that reached the bank. Never an estimate. */
  earnedHome: number;
  /** How many payments contributed to earnedHome. */
  settledCount: number;
  /** Settled, but into a non-INR account — real money, not addable to an INR total. */
  settledOther: CurrencyTotal[];
  /** Not settled yet: known in the sending currency, unknown in INR. */
  pending: CurrencyTotal[];
  pendingCount: number;
  /** True when every payment in range has a settlement recorded. */
  complete: boolean;
  total: number;
}

/**
 * Group any amount-plus-currency rows into per-currency totals.
 *
 * Used for Billed and Outstanding, which are receivables rather than money in the
 * bank. They deliberately are NOT converted to INR: no exchange rate has happened
 * yet, so any INR figure would be a guess presented next to exact numbers.
 */
export function groupByCurrency(
  rows: { amount: number | string; currency: string }[]
): CurrencyTotal[] {
  const out: CurrencyTotal[] = [];
  for (const r of rows) {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    add(out, r.currency.trim().toUpperCase(), amount);
  }
  return out.sort((a, b) => a.currency.localeCompare(b.currency));
}

function add(list: CurrencyTotal[], currency: string, amount: number) {
  const row = list.find((r) => r.currency === currency);
  if (row) {
    row.amount += amount;
    row.count += 1;
  } else {
    list.push({ currency, amount, count: 1 });
  }
}

export function computeEarnings(payments: PaymentRow[]): Earnings {
  let earnedInt = 0;
  let settledCount = 0;
  const settledOther: CurrencyTotal[] = [];
  const pending: CurrencyTotal[] = [];

  for (const p of payments) {
    const amount = p.received_amount == null ? null : Number(p.received_amount);
    const currency = p.received_currency?.trim().toUpperCase() || null;

    // Guard the half-filled pair in code too. Migration 0013 constrains it at the
    // DB, but this module must not silently drop money if a row ever slips through.
    const settled = amount != null && Number.isFinite(amount) && amount > 0 && !!currency;

    if (!settled) {
      add(pending, p.currency.trim().toUpperCase(), Number(p.total_amount) || 0);
      continue;
    }
    if (currency === HOME_CURRENCY) {
      earnedInt += toInt(amount);
      settledCount += 1;
    } else {
      add(settledOther, currency, amount);
      settledCount += 1;
    }
  }

  // Sort by currency code, not amount: ranking 300 EUR above 200 USD would imply a
  // cross-currency comparison this module deliberately refuses to make.
  const byCurrency = (a: CurrencyTotal, b: CurrencyTotal) => a.currency.localeCompare(b.currency);
  settledOther.sort(byCurrency);
  pending.sort(byCurrency);

  const pendingCount = pending.reduce((s, r) => s + r.count, 0);

  return {
    earnedHome: fromInt(earnedInt),
    settledCount,
    settledOther,
    pending,
    pendingCount,
    // "Complete" means nothing is missing from the INR figure — no unsettled
    // payments AND nothing sitting in a foreign account outside the total.
    complete: pendingCount === 0 && settledOther.length === 0,
    total: payments.length,
  };
}
