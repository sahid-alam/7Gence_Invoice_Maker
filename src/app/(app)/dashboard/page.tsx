import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, Plus, Banknote, TrendingUp, Clock, ArrowRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import { computeEarnings, groupByCurrency, inSettlementRange, HOME_CURRENCY } from "@/lib/earnings";
import { computeInsights } from "@/lib/insights";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { BooksBrief } from "@/components/dashboard/books-brief";
import { MiniTrend } from "@/components/dashboard/mini-trend";
import { Stagger, StaggerItem, RevealOnScroll, CountUp } from "@/components/motion/primitives";
import { AskBar } from "@/components/ai/ask-bar";
import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/types/app.types";

/**
 * This page stays a **server component**. Motion lives in the leaf components it
 * renders, which take finished numbers as props — turning the dashboard itself into
 * a client component would give up RSC data fetching on the app's busiest screen.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; fy?: string }>;
}) {
  const { profile, fy } = await searchParams;
  const member = await requireMember();
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  let statsQuery = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, status, total, currency, due_date, issue_date, paid_amount")
    .eq("org_id", member.orgId);
  let recentInvoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, currency, status, issue_date")
    .eq("org_id", member.orgId)
    .order("created_at", { ascending: false })
    .limit(5);
  let paymentsQuery = supabase
    .from("payments")
    .select("id, payer_name, total_amount, currency, received_amount, received_currency, payment_date, received_date")
    .eq("org_id", member.orgId);
  let recentPaymentsQuery = supabase
    .from("payments")
    .select("id, payer_name, total_amount, currency, received_amount, received_currency, payment_date, payment_mode")
    .eq("org_id", member.orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (profile) {
    statsQuery = statsQuery.eq("business_profile_id", profile);
    recentInvoicesQuery = recentInvoicesQuery.eq("business_profile_id", profile);
    paymentsQuery = paymentsQuery.eq("business_profile_id", profile);
    recentPaymentsQuery = recentPaymentsQuery.eq("business_profile_id", profile);
  }

  const [
    invoiceStatsRes, recentInvoicesRes, profilesRes, paymentsStatsRes, recentPaymentsRes, linksRes,
  ] = await Promise.all([
    statsQuery,
    recentInvoicesQuery,
    supabase
      .from("business_profiles")
      .select("id, display_name, country")
      .eq("org_id", member.orgId)
      .order("display_name"),
    paymentsQuery,
    recentPaymentsQuery,
    // Needed to date each invoice's settlement — that is what "how fast does this
    // client pay" is measured from.
    supabase
      .from("payment_invoice_links")
      .select("payment_id, invoice_id, amount_applied")
      .eq("org_id", member.orgId),
  ]);

  // A failed query returns data: null, which would roll up to a confident ₹0.00 —
  // the exact silently-wrong money figure this whole feature exists to prevent.
  // Surface the failure instead of totalling nothing.
  const paymentsError = paymentsStatsRes.error?.message ?? null;

  const invoices = invoiceStatsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const allPaymentStats = paymentsStatsRes.data ?? [];
  const recentPayments = recentPaymentsRes.data ?? [];

  const selectedProfileCountry = profile
    ? (profiles.find((p) => p.id === profile)?.country ?? null)
    : null;
  const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
  const effectiveCountry =
    selectedProfileCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
  const fyConfig = getFYConfig(effectiveCountry);
  const fyRange = fy ? getFYDateRange(Number(fy), fyConfig) : null;
  const hasProfiles = profiles.length > 0;

  const filteredInvoices = fyRange
    ? invoices.filter((i) => i.issue_date >= fyRange.start && i.issue_date <= fyRange.end)
    : invoices;

  // Earnings are filtered by when the money reached the bank (see lib/earnings).
  const filteredPayments = inSettlementRange(allPaymentStats, fyRange);

  const statuses = [
    { key: "draft", label: "Draft", tone: "text-muted-foreground" },
    { key: "sent", label: "Sent", tone: "text-foreground" },
    { key: "partial", label: "Partial", tone: "text-blue-600" },
    { key: "overdue", label: "Overdue", tone: "text-amber-600" },
    { key: "paid", label: "Paid", tone: "text-green-600" },
  ] as const;

  const counts: Record<string, number> = {
    draft: filteredInvoices.filter((i) => i.status === "draft").length,
    sent: filteredInvoices.filter((i) => i.status === "sent").length,
    partial: filteredInvoices.filter((i) => i.status === "partial").length,
    overdue: filteredInvoices.filter(
      (i) => (i.status === "sent" || i.status === "partial") && i.due_date != null && i.due_date < today
    ).length,
    paid: filteredInvoices.filter((i) => i.status === "paid").length,
  };

  // Billed and Outstanding stay in the currency they were invoiced in. They are
  // receivables, not money — no conversion has happened, so an INR figure here
  // would be an estimate sitting next to exact ones.
  const billedByCurrency = groupByCurrency(
    filteredInvoices
      .filter((i) => i.status !== "draft" && i.status !== "void")
      .map((i) => ({ amount: i.total, currency: i.currency }))
  );

  const outstandingByCurrency = groupByCurrency(
    filteredInvoices
      .filter((i) => i.status === "sent" || i.status === "partial")
      .map((i) => ({ amount: i.total - (i.paid_amount ?? 0), currency: i.currency }))
  ).filter((r) => r.amount > 0);

  const earnings = computeEarnings(filteredPayments);

  // Six months of settled INR, oldest first, for the hero's trend.
  const months = lastSixMonths(today).map(({ key, label }) => ({
    label,
    value: filteredPayments
      .filter(
        (p) =>
          p.received_amount != null &&
          p.received_currency === HOME_CURRENCY &&
          (p.received_date ?? p.payment_date ?? "").startsWith(key)
      )
      .reduce((s, p) => s + Number(p.received_amount), 0),
  }));

  // Insights deliberately ignore the financial-year filter, invoices and payments
  // alike. "This client has gone quiet" and "this invoice is 75 days overdue" are
  // facts about where things stand now, not about a tax year — and mixing the two
  // was visibly wrong: selecting an empty year zeroed the cards while concentration
  // and FX carried on reporting all-time figures beside them.
  const insights = paymentsError
    ? []
    : computeInsights({
        today,
        invoices,
        payments: allPaymentStats,
        links: linksRes.data ?? [],
      });

  return (
    <div className="space-y-8 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">What your books say today</p>
        </div>
        <div className="flex items-center gap-3">
          <FYFilter
            countryCode={effectiveCountry}
            selectedFY={fy}
            basePath="/dashboard"
            extraParams={{ profile }}
          />
          {!hasProfiles ? (
            <Button asChild>
              <Link href="/profiles/new">
                <Plus size={16} className="mr-2" />
                Create profile first
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/invoices/new">
                <Plus size={16} className="mr-2" />
                New Invoice
              </Link>
            </Button>
          )}
        </div>
      </div>

      {hasProfiles && <AskBar />}

      <ProfileFilter
        profiles={profiles}
        selectedProfile={profile}
        basePath="/dashboard"
        extraParams={{ fy }}
      />

      {!hasProfiles && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Set up your business profile first to start creating invoices.{" "}
          <Link href="/profiles/new" className="font-medium underline">
            Create profile →
          </Link>
        </div>
      )}

      {/* Money */}
      <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-1">
          <div className="h-full rounded-2xl border border-green-200/70 bg-card p-5 shadow-card dark:border-green-900/40">
            <p className="flex items-center gap-2 text-sm font-medium text-green-600">
              <Banknote size={14} /> Earned ({HOME_CURRENCY})
            </p>

            {paymentsError ? (
              <>
                <p className="mt-2 text-4xl font-bold text-muted-foreground">—</p>
                <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  Couldn&apos;t read the payments ledger, so no total is shown rather than a
                  wrong one. {paymentsError}
                </p>
              </>
            ) : (
              <>
                <div className="mt-2">
                  <MiniTrend
                    months={months}
                    amount={earnings.earnedHome}
                    symbol={CURRENCY_SYMBOLS[HOME_CURRENCY as CurrencyCode] ?? "₹"}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Actually credited to your bank
                  {earnings.settledCount > 0 &&
                    ` · ${earnings.settledCount} payment${earnings.settledCount === 1 ? "" : "s"}`}
                </p>

                {/* The figure must never look complete when it isn't. */}
                {earnings.pendingCount > 0 && (
                  <Link
                    href="/payments"
                    className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
                  >
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-medium">
                        {earnings.pendingCount} payment{earnings.pendingCount === 1 ? "" : "s"} not settled
                      </span>{" "}
                      ({earnings.pending.map((r) => formatCurrency(r.amount, r.currency)).join(" · ")}) — not
                      in this total. Add the bank amount →
                    </span>
                  </Link>
                )}
                {earnings.settledOther.length > 0 && (
                  <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                    Also held outside {HOME_CURRENCY}:{" "}
                    {earnings.settledOther.map((r) => formatCurrency(r.amount, r.currency)).join(" · ")}
                  </p>
                )}
              </>
            )}
          </div>
        </StaggerItem>

        <StaggerItem>
          <MoneyCard
            icon={<TrendingUp size={14} />}
            label="Total billed"
            rows={billedByCurrency}
            caption="Sent & paid invoices"
          />
        </StaggerItem>

        <StaggerItem>
          <MoneyCard
            icon={<Clock size={14} />}
            label="Outstanding"
            rows={outstandingByCurrency}
            caption="Still owed on sent invoices · not converted, no rate applied yet"
            tone="text-amber-600"
            border="border-amber-200/70 dark:border-amber-900/40"
            zero={formatCurrency(0, HOME_CURRENCY)}
          />
        </StaggerItem>
      </Stagger>

      {/* Status strip — five counts don't need five cards */}
      <StaggerItem>
        <div className="grid grid-cols-2 divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {statuses.map((s) => (
            <Link
              key={s.key}
              href={`/invoices?status=${s.key}`}
              className="group px-5 py-4 transition-colors hover:bg-accent/50"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <CountUp value={counts[s.key]} className={`mt-1 block text-2xl font-bold ${s.tone}`} />
            </Link>
          ))}
        </div>
      </StaggerItem>

      {/* Insights */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">What stands out</h3>
            <p className="text-xs text-muted-foreground">
              {fyRange
                ? "Where things stand now — not limited to the selected year"
                : "Worked out from your rows — every figure links to what produced it"}
            </p>
          </div>
        </div>
        {/* Trigger and summary are one component so they share state; it sits
            between the heading and the cards it summarises. */}
        {insights.length > 0 && <BooksBrief profileId={profile} />}
        <InsightsPanel insights={insights} />
      </section>

      {/* Recent activity */}
      <RevealOnScroll className="grid gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Recent invoices</h3>
            <Link href="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
              View all <ArrowRight size={13} className="inline" />
            </Link>
          </div>
          {(recentInvoicesRes.data?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
              {hasProfiles && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/invoices/new">Create your first invoice</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentInvoicesRes.data?.map((inv) => (
                    <tr key={inv.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-medium hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.client_name}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {recentPayments.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Recent payments</h3>
              <Link href="/payments" className="text-sm text-muted-foreground hover:text-foreground">
                View all <ArrowRight size={13} className="inline" />
              </Link>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Payer</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{p.payment_date}</td>
                      <td className="px-4 py-3 font-medium">{p.payer_name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="block font-medium">
                          {p.received_amount && p.received_currency
                            ? formatCurrency(Number(p.received_amount), p.received_currency as CurrencyCode)
                            : formatCurrency(Number(p.total_amount), p.currency)}
                        </span>
                        {p.received_amount && p.received_currency && (
                          <span className="block text-xs text-muted-foreground">
                            {formatCurrency(Number(p.total_amount), p.currency)} invoiced
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {p.payment_mode?.replace("_", " ") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </RevealOnScroll>
    </div>
  );
}

/**
 * Billed and Outstanding. Grouped per currency, never summed across them — an
 * invoice in dollars and one in euros have no common total until money moves.
 */
function MoneyCard({
  icon, label, rows, caption, tone = "", border = "border-border", zero,
}: {
  icon: React.ReactNode;
  label: string;
  rows: { currency: string; amount: number }[];
  caption: string;
  tone?: string;
  border?: string;
  zero?: string;
}) {
  return (
    <div className={`h-full rounded-2xl border ${border} bg-card p-5 shadow-card`}>
      <p className={`flex items-center gap-2 text-sm font-medium ${tone || "text-muted-foreground"}`}>
        {icon} {label}
      </p>
      {rows.length === 0 ? (
        <p className={`mt-2 text-3xl font-bold ${tone || "text-muted-foreground"}`}>
          {zero ?? "—"}
        </p>
      ) : (
        <div className="mt-2 space-y-0.5">
          {rows.map((r, i) => (
            <p
              key={r.currency}
              className={
                i === 0
                  ? `text-3xl font-bold ${tone}`
                  : `text-lg font-semibold ${tone ? `${tone} opacity-70` : "text-muted-foreground"}`
              }
            >
              {formatCurrency(r.amount, r.currency)}
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

/** The six months ending today, oldest first. */
function lastSixMonths(today: string): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const [y, m] = today.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
    });
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-100 text-blue-700",
    partial: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    void: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
