import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertCircle, CheckCircle2, Plus, Banknote, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import { computeEarnings, groupByCurrency, inSettlementRange, HOME_CURRENCY } from "@/lib/earnings";
import type { CurrencyCode } from "@/types/app.types";

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
    .select("status, total, currency, due_date, issue_date, paid_amount")
    .eq("org_id", member.orgId);
  let recentInvoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, currency, status, issue_date")
    .eq("org_id", member.orgId)
    .order("created_at", { ascending: false })
    .limit(5);
  let paymentsQuery = supabase
    .from("payments")
    .select("total_amount, currency, received_amount, received_currency, payment_date, received_date")
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

  const [invoiceStatsRes, recentInvoicesRes, profilesRes, paymentsStatsRes, recentPaymentsRes] =
    await Promise.all([
      statsQuery,
      recentInvoicesQuery,
      supabase
        .from("business_profiles")
        .select("id, display_name, country")
        .eq("org_id", member.orgId)
        .order("display_name"),
      paymentsQuery,
      recentPaymentsQuery,
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

  // Status counts
  const draft = filteredInvoices.filter((i) => i.status === "draft").length;
  const sentCount = filteredInvoices.filter((i) => i.status === "sent").length;
  const partial = filteredInvoices.filter((i) => i.status === "partial").length;
  const overdue = filteredInvoices.filter(
    (i) =>
      (i.status === "sent" || i.status === "partial") &&
      i.due_date != null &&
      i.due_date < today
  ).length;
  const paid = filteredInvoices.filter((i) => i.status === "paid").length;

  // Billed and Outstanding stay in the currency they were invoiced in. They are
  // receivables, not money — no conversion has happened, so an INR figure here
  // would be an estimate sitting next to exact ones. Grouping beats the old
  // behaviour of showing nothing at all whenever more than one currency was in play.
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

  // Earnings — exact INR that reached the bank, plus everything the figure is
  // missing. The old logic returned null whenever payments spanned more than one
  // currency or any settlement was absent, so the number silently disappeared in
  // exactly the case it mattered most. See src/lib/earnings.ts.
  const earnings = computeEarnings(filteredPayments);

  return (
    <div className="p-4 sm:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your invoices and payments</p>
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

      <ProfileFilter
        profiles={profiles}
        selectedProfile={profile}
        basePath="/dashboard"
        extraParams={{ fy }}
      />

      {!hasProfiles && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Set up your business profile first to start creating invoices.{" "}
          <Link href="/profiles/new" className="font-medium underline">
            Create profile →
          </Link>
        </div>
      )}

      {/* Financial overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp size={14} /> Total Billed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {billedByCurrency.length === 0 ? (
              <p className="text-3xl font-bold text-muted-foreground">—</p>
            ) : (
              <div className="space-y-0.5">
                {billedByCurrency.map((r, i) => (
                  <p key={r.currency} className={i === 0 ? "text-3xl font-bold" : "text-lg font-semibold text-muted-foreground"}>
                    {formatCurrency(r.amount, r.currency)}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Sent &amp; paid invoices</p>
          </CardContent>
        </Card>

        <Card className="border-green-200/60 dark:border-green-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <Banknote size={14} /> Earned ({HOME_CURRENCY})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentsError ? (
              <>
                <p className="text-3xl font-bold text-muted-foreground">—</p>
                <p className="mt-1 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  Couldn&apos;t read the payments ledger, so no total is shown rather than a
                  wrong one. {paymentsError}
                </p>
              </>
            ) : (
              <>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(earnings.earnedHome, HOME_CURRENCY)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Actually credited to your bank
              {earnings.settledCount > 0 && ` · ${earnings.settledCount} payment${earnings.settledCount === 1 ? "" : "s"}`}
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
          </CardContent>
        </Card>

        <Card className="border-amber-200/60 dark:border-amber-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <Clock size={14} /> Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outstandingByCurrency.length === 0 ? (
              <p className="text-3xl font-bold text-amber-600">
                {formatCurrency(0, HOME_CURRENCY)}
              </p>
            ) : (
              <div className="space-y-0.5">
                {outstandingByCurrency.map((r, i) => (
                  <p key={r.currency} className={i === 0 ? "text-3xl font-bold text-amber-600" : "text-lg font-semibold text-amber-600/70"}>
                    {formatCurrency(r.amount, r.currency)}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Still owed on sent invoices · not converted, no rate applied yet
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText size={14} /> Draft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{draft}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText size={14} /> Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sentCount}</p>
            {overdue > 0 && (
              <p className="text-xs text-amber-600 mt-1">{overdue} overdue</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200/60 dark:border-blue-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <FileText size={14} /> Partial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{partial}</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/60 dark:border-amber-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <AlertCircle size={14} /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{overdue}</p>
          </CardContent>
        </Card>

        <Card className="border-green-200/60 dark:border-green-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <CheckCircle2 size={14} /> Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{paid}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent Invoices</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices">View all →</Link>
          </Button>
        </div>
        {(recentInvoicesRes.data?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground text-sm">No invoices yet.</p>
            {hasProfiles && (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/invoices/new">Create your first invoice</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentInvoicesRes.data?.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium hover:underline font-mono"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.issue_date}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(inv.total, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Payments */}
      {recentPayments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Payments</h3>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/payments">View all →</Link>
            </Button>
          </div>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payer</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{p.payment_date}</td>
                    <td className="px-4 py-3 font-medium">{p.payer_name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium block">
                        {p.received_amount && p.received_currency
                          ? formatCurrency(Number(p.received_amount), p.received_currency as CurrencyCode)
                          : formatCurrency(Number(p.total_amount), p.currency)}
                      </span>
                      {p.received_amount && p.received_currency && (
                        <span className="text-xs text-muted-foreground block">
                          {formatCurrency(Number(p.total_amount), p.currency)} invoiced
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {p.payment_mode?.replace("_", " ") ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
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
