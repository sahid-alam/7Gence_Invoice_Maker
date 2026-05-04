import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; fy?: string }>;
}) {
  const { profile, fy } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profilesRes, receiptsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, country")
      .eq("owner_id", user!.id)
      .order("display_name"),
    (() => {
      let q = supabase
        .from("receipts")
        .select("id, receipt_number, client_name, amount, currency, payment_date, invoice_id, business_profile_id")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      if (profile) q = q.eq("business_profile_id", profile);
      return q;
    })(),
  ]);

  const receipts = receiptsRes.data ?? [];
  const profiles = profilesRes.data ?? [];

  const selectedProfileCountry = profile
    ? (profiles.find((p) => p.id === profile)?.country ?? null)
    : null;
  const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
  const effectiveCountry = selectedProfileCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
  const fyConfig = getFYConfig(effectiveCountry);
  const fyRange = fy ? getFYDateRange(Number(fy), fyConfig) : null;

  const filteredReceipts = fyRange
    ? receipts.filter((r) => r.payment_date >= fyRange.start && r.payment_date <= fyRange.end)
    : receipts;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Receipts</h2>
          <p className="text-muted-foreground">Payment receipts for your records</p>
        </div>
        <FYFilter
          countryCode={effectiveCountry}
          selectedFY={fy}
          basePath="/receipts"
          extraParams={{ profile }}
        />
      </div>

      <ProfileFilter
        profiles={profiles}
        selectedProfile={profile}
        basePath="/receipts"
        extraParams={{ fy }}
      />

      {filteredReceipts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Receipt size={32} className="mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No receipts yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Receipts are auto-created when you mark an invoice as paid, or create one manually.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Receipt #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredReceipts.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/receipts/${r.id}`} className="font-mono font-medium hover:underline">
                      {r.receipt_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.client_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.payment_date}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(r.amount, r.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.invoice_id ? (
                      <Link href={`/invoices/${r.invoice_id}`} className="hover:underline text-xs">
                        View invoice
                      </Link>
                    ) : "Standalone"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
