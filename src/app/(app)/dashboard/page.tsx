import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertCircle, CheckCircle2, Plus, Banknote, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import type { CurrencyCode } from "@/types/app.types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; fy?: string }>;
}) {
  const { profile, fy } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = new Date().toISOString().split("T")[0];

  let statsQuery = supabase
    .from("invoices")
    .select("status, total, currency, due_date, issue_date, paid_amount")
    .eq("owner_id", user!.id);
  let recentInvoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, currency, status, issue_date")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(5);
  let paymentsQuery = supabase
    .from("payments")
    .select("total_amount, currency, payment_date")
    .eq("owner_id", user!.id);
  let recentPaymentsQuery = supabase
    .from("payments")
    .select("id, payer_name, total_amount, currency, payment_date, payment_mode")
    .eq("owner_id", user!.id)
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
        .eq("owner_id", user!.id)
        .order("display_name"),
      paymentsQuery,
      recentPaymentsQuery,
    ]);

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

  const filteredPayments = fyRange
    ? allPaymentStats.filter(
        (p) => p.payment_date >= fyRange.start && p.payment_date <= fyRange.end
      )
    : allPaymentStats;

  // Status counts — fixed: sent includes all sent/partial regardless of due date
  const draft = filteredInvoices.filter((i) => i.status === "draft").length;
  const sent = filteredInvoices.filter(
    (i) => i.status === "sent" || i.status === "partial"
  ).length;
  const overdue = filteredInvoices.filter(
    (i) =>
      (i.status === "sent" || i.status === "partial") &&
      i.due_date != null &&
      i.due_date < today
  ).length;
  const paid = filteredInvoices.filter((i) => i.status === "paid").length;

  // Financial stats — shown when all filtered invoices share one currency
  const activeCurrencies = Array.from(
    new Set(
      filteredInvoices
        .filter((i) => i.status !== "void")
        .map((i) => i.currency)
    )
  );
  const primaryCurrency: CurrencyCode | null =
    activeCurrencies.length === 1 ? (activeCurrencies[0] as CurrencyCode) : null;

  const totalBilled =
    primaryCurrency != null
      ? filteredInvoices
          .filter((i) => i.status !== "draft" && i.status !== "void")
          .reduce((s, i) => s + i.total, 0)
      : null;

  const outstanding =
    primaryCurrency != null
      ? filteredInvoices
          .filter((i) => i.status === "sent" || i.status === "partial")
          .reduce((s, i) => s + (i.total - (i.paid_amount ?? 0)), 0)
      : null;

  const totalReceived =
    primaryCurrency != null
      ? filteredPayments
          .filter((p) => p.currency === primaryCurrency)
          .reduce((s, p) => s + Number(p.total_amount), 0)
      : null;

  return (
    <div className="p-8 space-y-8">
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
            {totalBilled != null ? (
              <p className="text-3xl font-bold">{formatCurrency(totalBilled, primaryCurrency!)}</p>
            ) : (
              <p className="text-3xl font-bold">
                {filteredInvoices.filter((i) => i.status !== "draft" && i.status !== "void").length}
                <span className="text-lg font-normal text-muted-foreground ml-1">inv.</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Sent &amp; paid invoices</p>
          </CardContent>
        </Card>

        <Card className="border-green-200/60 dark:border-green-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <Banknote size={14} /> Total Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalReceived != null ? (
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(totalReceived, primaryCurrency!)}
              </p>
            ) : (
              <p className="text-3xl font-bold text-green-600">
                {filteredPayments.length}
                <span className="text-lg font-normal text-muted-foreground ml-1">pmts.</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">From payments ledger</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/60 dark:border-amber-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <Clock size={14} /> Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outstanding != null ? (
              <p className="text-3xl font-bold text-amber-600">
                {formatCurrency(outstanding, primaryCurrency!)}
              </p>
            ) : (
              <p className="text-3xl font-bold text-amber-600">
                {sent}
                <span className="text-lg font-normal text-muted-foreground ml-1">inv.</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Remaining on sent invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            <p className="text-3xl font-bold">{sent}</p>
            {overdue > 0 && (
              <p className="text-xs text-amber-600 mt-1">{overdue} overdue</p>
            )}
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
          <div className="rounded-lg border border-border overflow-hidden">
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
          <div className="rounded-lg border border-border overflow-hidden">
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
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(p.total_amount), p.currency)}
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
