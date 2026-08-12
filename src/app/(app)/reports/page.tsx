import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/currency";
import { FYFilter } from "@/components/filters/fy-filter";
import { MonthlyEarningsChart } from "@/components/reports/monthly-earnings-chart";
import { buildFYReport } from "@/lib/fy-report";
import { computeEarnings, groupByCurrency, inSettlementRange, HOME_CURRENCY } from "@/lib/earnings";
import {
  getFYConfig, getFYDateRange, getFYLabel, getCurrentFYStartYear,
} from "@/lib/financial-year";
import { AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const { fy } = await searchParams;
  const member = await requireMember();
  const supabase = await createClient();

  const [paymentsRes, invoicesRes, profilesRes] = await Promise.all([
    supabase
      .from("payments")
      .select("total_amount, currency, received_amount, received_currency, payment_date, received_date")
      .eq("org_id", member.orgId),
    supabase
      .from("invoices")
      .select("total, currency, status, issue_date, paid_amount")
      .eq("org_id", member.orgId),
    supabase
      .from("business_profiles")
      .select("country")
      .eq("org_id", member.orgId),
  ]);

  // A failed query would total to a confident zero. Say so instead.
  const loadError = paymentsRes.error?.message ?? null;
  const payments = paymentsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];

  const countries = Array.from(
    new Set((profilesRes.data ?? []).map((p) => p.country).filter(Boolean))
  );
  const country = countries.length === 1 ? countries[0] : null;
  const config = getFYConfig(country);

  const startYear = fy ? Number(fy) : getCurrentFYStartYear(config);
  const range = getFYDateRange(startYear, config);
  const previousRange = getFYDateRange(startYear - 1, config);

  const report = buildFYReport(payments, {
    startYear,
    startMonth: config.startMonth,
    label: getFYLabel(startYear, config),
    previousLabel: getFYLabel(startYear - 1, config),
    range,
    previousRange,
  });

  // Everything not in the Earned figure, so the year can't look complete when it isn't.
  const earnings = computeEarnings(inSettlementRange(payments, range));

  const invoicesInYear = invoices.filter(
    (i) => i.issue_date >= range.start && i.issue_date <= range.end
  );
  const billed = groupByCurrency(
    invoicesInYear
      .filter((i) => i.status !== "draft" && i.status !== "void")
      .map((i) => ({ amount: i.total, currency: i.currency }))
  );
  const outstanding = groupByCurrency(
    invoicesInYear
      .filter((i) => i.status === "sent" || i.status === "partial")
      .map((i) => ({ amount: i.total - (i.paid_amount ?? 0), currency: i.currency }))
  ).filter((r) => r.amount > 0);

  const Trend = report.change == null ? Minus : report.change >= 0 ? TrendingUp : TrendingDown;
  const trendTone =
    report.change == null
      ? "text-muted-foreground"
      : report.change >= 0
        ? "text-green-600"
        : "text-amber-600";

  return (
    <div className="max-w-4xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {report.label}
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Financial year</h2>
          <p className="text-muted-foreground">
            {range.start} to {range.end}
            {country ? ` · ${country} tax year` : " · calendar year"}
          </p>
        </div>
        <FYFilter countryCode={country} selectedFY={fy ?? String(startYear)} basePath="/reports" />
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-50 p-5 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Couldn&apos;t read the payments ledger
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300/90">
            {loadError} — showing nothing rather than a total built on missing data.
          </p>
        </div>
      ) : (
        <>
          {/* Hero: the number this page exists to answer. */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <p className="text-sm font-medium text-muted-foreground">
              Received in {HOME_CURRENCY}
            </p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-green-600">
              {formatCurrency(report.earned, HOME_CURRENCY)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={`inline-flex items-center gap-1 font-medium ${trendTone}`}>
                <Trend size={14} />
                {report.change == null
                  ? `No ${report.previousLabel} on record`
                  : `${report.change >= 0 ? "+" : ""}${Math.round(report.change * 100)}% vs ${report.previousLabel}`}
              </span>
              {report.previousEarned != null && (
                <span className="text-muted-foreground">
                  ({formatCurrency(report.previousEarned, HOME_CURRENCY)})
                </span>
              )}
              <span className="text-muted-foreground">
                · {report.paymentCount} payment{report.paymentCount === 1 ? "" : "s"}
              </span>
            </p>

            {earnings.pendingCount > 0 && (
              <Link
                href="/payments"
                className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
              >
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">
                    {earnings.pendingCount} payment{earnings.pendingCount === 1 ? "" : "s"} not settled
                  </span>{" "}
                  ({earnings.pending.map((r) => formatCurrency(r.amount, r.currency)).join(" · ")})
                  — not counted in this year. Add the bank amount →
                </span>
              </Link>
            )}
            {earnings.settledOther.length > 0 && (
              <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Also held outside {HOME_CURRENCY}:{" "}
                {earnings.settledOther.map((r) => formatCurrency(r.amount, r.currency)).join(" · ")}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-sm font-semibold">
              Month by month{" "}
              <span className="font-normal text-muted-foreground">
                — when the money reached the bank
              </span>
            </h3>
            <MonthlyEarningsChart
              months={report.months}
              peak={report.peak}
              currency={HOME_CURRENCY}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Billed" note="Sent and paid invoices issued this year" rows={billed} />
            <Panel
              title="Still owed"
              note="Not converted — no exchange rate applied"
              rows={outstanding}
              empty="Nothing outstanding"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Received counts money that actually reached the bank, dated by when it
            landed. Billed and Still owed stay in the currency they were invoiced in,
            because no conversion has happened for them yet.
          </p>
        </>
      )}
    </div>
  );
}

function Panel({
  title, note, rows, empty = "—",
}: {
  title: string;
  note: string;
  rows: { currency: string; amount: number }[];
  empty?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-2xl font-bold text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 space-y-0.5">
          {rows.map((r, i) => (
            <p
              key={r.currency}
              className={i === 0 ? "text-2xl font-bold tabular-nums" : "text-base font-semibold tabular-nums text-muted-foreground"}
            >
              {formatCurrency(r.amount, r.currency)}
            </p>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
