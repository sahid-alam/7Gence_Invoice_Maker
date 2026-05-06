import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import { Banknote, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeletePaymentButton } from "@/components/payments/delete-payment-button";
import { SettlePaymentButton } from "@/components/payments/settle-payment-button";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; fy?: string }>;
}) {
  const { profile, fy } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profilesRes, paymentsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, country")
      .eq("owner_id", user!.id)
      .order("display_name"),
    (() => {
      let q = supabase
        .from("payments")
        .select(`
          id, payer_name, total_amount, currency, received_amount, received_currency,
          payment_date, payment_mode, reference, notes, business_profile_id,
          payment_invoice_links(invoice_id, amount_applied, invoices(invoice_number))
        `)
        .eq("owner_id", user!.id)
        .order("payment_date", { ascending: false });
      if (profile) q = q.eq("business_profile_id", profile);
      return q;
    })(),
  ]);

  const payments = paymentsRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const selectedProfileCountry = profile
    ? (profiles.find((p) => p.id === profile)?.country ?? null)
    : null;
  const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
  const effectiveCountry = selectedProfileCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
  const fyConfig = getFYConfig(effectiveCountry);
  const fyRange = fy ? getFYDateRange(Number(fy), fyConfig) : null;

  const filteredPayments = fyRange
    ? payments.filter((p) => p.payment_date >= fyRange.start && p.payment_date <= fyRange.end)
    : payments;

  const exportParams = new URLSearchParams();
  if (profile) exportParams.set("profile", profile);
  if (fy) exportParams.set("fy", fy);

  return (
    <div className="p-8 space-y-6">
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

      {filteredPayments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Banknote size={32} className="mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No payments recorded yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Record a payment from an invoice using the actions menu.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
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
                          {formatCurrency(pay.received_amount, pay.received_currency)} received
                        </span>
                      ) : pay.payment_mode === "crypto" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          Pending settlement
                        </span>
                      ) : null}
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
                        {pay.payment_mode === "crypto" && !pay.received_amount && (
                          <SettlePaymentButton paymentId={pay.id} invoiceCurrency={pay.currency} />
                        )}
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
