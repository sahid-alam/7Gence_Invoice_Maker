import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import { Banknote, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeletePaymentButton } from "@/components/payments/delete-payment-button";
import { SettlePaymentButton } from "@/components/payments/settle-payment-button";
import { computeEarnings, inSettlementRange, HOME_CURRENCY } from "@/lib/earnings";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; fy?: string }>;
}) {
  const { profile, fy } = await searchParams;
  const member = await requireMember();
  const supabase = await createClient();

  const [profilesRes, paymentsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, country")
      .eq("org_id", member.orgId)
      .order("display_name"),
    (() => {
      let q = supabase
        .from("payments")
        .select(`
          id, payer_name, total_amount, currency, received_amount, received_currency, received_date,
          payment_date, payment_mode, reference, notes, business_profile_id,
          payment_invoice_links(invoice_id, amount_applied, invoices(invoice_number))
        `)
        .eq("org_id", member.orgId)
        .order("payment_date", { ascending: false });
      if (profile) q = q.eq("business_profile_id", profile);
      return q;
    })(),
  ]);

  // A failed query returns data: null, which would render as "no payments yet" —
  // indistinguishable from an empty ledger. Say what actually happened.
  const paymentsError = paymentsRes.error?.message ?? null;
  const payments = paymentsRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const selectedProfileCountry = profile
    ? (profiles.find((p) => p.id === profile)?.country ?? null)
    : null;
  const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
  const effectiveCountry = selectedProfileCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
  const fyConfig = getFYConfig(effectiveCountry);
  const fyRange = fy ? getFYDateRange(Number(fy), fyConfig) : null;

  // Filtered by settlement date, not payment date: a client paying on 25 March
  // whose rupees land 5 April belongs to the later FY. Falls back to payment_date
  // while unsettled, so nothing drops out of the list.
  const filteredPayments = inSettlementRange(payments, fyRange);

  const earnings = computeEarnings(filteredPayments);

  const exportParams = new URLSearchParams();
  if (profile) exportParams.set("profile", profile);
  if (fy) exportParams.set("fy", fy);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground">Bank entries — money received</p>
        </div>
        <div className="flex items-center gap-3">
          <FYFilter
            countryCode={effectiveCountry}
            selectedFY={fy}
            basePath="/payments"
            extraParams={{ profile }}
          />
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/payments/export?${exportParams.toString()}`}>
              <Download size={14} className="mr-2" />
              CSV Export
            </a>
          </Button>
        </div>
      </div>

      <ProfileFilter
        profiles={profiles}
        selectedProfile={profile}
        basePath="/payments"
        extraParams={{ fy }}
      />

      {/* Backfill prompt for history. Until these are filled in, the dashboard's
          earnings figure is knowingly incomplete — so say so here, with the number. */}
      {earnings.pendingCount > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {earnings.pendingCount} payment{earnings.pendingCount === 1 ? "" : "s"} missing a bank amount
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/90">
            {earnings.pending.map((r) => `${formatCurrency(r.amount, r.currency)}`).join(" · ")} received
            from clients, but not yet recorded as landed. Until you add these, they are
            left out of your {HOME_CURRENCY} earnings rather than guessed at. Use
            &ldquo;Settle&rdquo; on each row below.
          </p>
        </div>
      )}

      {paymentsError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-50 p-4 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Couldn&apos;t load the payments ledger
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300/90">
            {paymentsError} — showing nothing rather than an empty ledger that would look
            like you have no payments.
          </p>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Banknote size={32} className="mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No payments recorded yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Record a payment from an invoice using the actions menu.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payer</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice(s)</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPayments.map((pay) => {
                const links = (pay.payment_invoice_links ?? []) as unknown as {
                  invoice_id: string;
                  amount_applied: number;
                  invoices: { invoice_number: string } | null;
                }[];
                return (
                  <tr key={pay.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{pay.payment_date}</td>
                    <td className="px-4 py-3 font-medium">{pay.payer_name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium block">
                        {formatCurrency(pay.total_amount, pay.currency)}
                      </span>
                      {pay.received_amount && pay.received_currency ? (
                        <span className="text-xs text-muted-foreground block">
                          {formatCurrency(pay.received_amount, pay.received_currency)} in bank
                          {pay.received_date && pay.received_date !== pay.payment_date && (
                            <span className="block text-[11px]">on {pay.received_date}</span>
                          )}
                        </span>
                      ) : (
                        // Every unsettled payment is flagged, not just crypto — any of
                        // them is money missing from the earnings total.
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Not settled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {pay.payment_mode?.replace("_", " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {pay.reference ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {links.length === 0
                        ? "—"
                        : links.map((l, i) => (
                            <span key={l.invoice_id}>
                              {i > 0 && ", "}
                              <Link
                                href={`/invoices/${l.invoice_id}`}
                                className="hover:underline font-mono"
                              >
                                {l.invoices?.invoice_number ?? l.invoice_id.slice(0, 8)}
                              </Link>
                            </span>
                          ))}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <SettlePaymentButton
                          paymentId={pay.id}
                          paidCurrency={pay.currency}
                          paidAmount={Number(pay.total_amount)}
                          settled={!!pay.received_amount}
                          label={pay.received_amount ? "Edit" : "Settle"}
                        />
                        <DeletePaymentButton paymentId={pay.id} payerName={pay.payer_name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
