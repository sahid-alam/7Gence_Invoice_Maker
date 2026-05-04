import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ProfileFilter } from "@/components/filters/profile-filter";
import { FYFilter } from "@/components/filters/fy-filter";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; profile?: string; fy?: string }>;
}) {
  const { status, profile, fy } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, currency, status, issue_date, due_date, business_profile_id")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });

  if (status === "overdue") {
    query = query.eq("status", "sent").lt("due_date", today);
  } else if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (profile) {
    query = query.eq("business_profile_id", profile);
  }

  const [profilesRes, { data: invoices }, { data: allForCounts }] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, country")
      .eq("owner_id", user!.id)
      .order("display_name"),
    query,
    (() => {
      let q = supabase
        .from("invoices")
        .select("status, due_date, issue_date")
        .eq("owner_id", user!.id);
      if (profile) q = q.eq("business_profile_id", profile);
      return q;
    })(),
  ]);

  const profiles = profilesRes.data ?? [];

  const selectedProfileCountry = profile
    ? (profiles.find((p) => p.id === profile)?.country ?? null)
    : null;
  const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
  const effectiveCountry = selectedProfileCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
  const fyConfig = getFYConfig(effectiveCountry);
  const fyRange = fy ? getFYDateRange(Number(fy), fyConfig) : null;

  const countsSource = fyRange
    ? (allForCounts ?? []).filter((i) => i.issue_date >= fyRange.start && i.issue_date <= fyRange.end)
    : (allForCounts ?? []);

  const counts = countsSource.reduce<Record<string, number>>((acc, inv) => {
    const isOverdue = (inv.status === "sent" || inv.status === "partial") && inv.due_date < today;
    const key = isOverdue ? "overdue" : inv.status;
    acc[key] = (acc[key] ?? 0) + 1;
    acc["all"] = (acc["all"] ?? 0) + 1;
    return acc;
  }, {});

  const filteredInvoices = fyRange
    ? (invoices ?? []).filter((i) => i.issue_date >= fyRange.start && i.issue_date <= fyRange.end)
    : (invoices ?? []);

  const tabs = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "sent", label: "Sent" },
    { key: "partial", label: "Partial" },
    { key: "paid", label: "Paid" },
    { key: "overdue", label: "Overdue" },
    { key: "void", label: "Void" },
  ];

  const activeTab = status || "all";

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
        <div className="flex items-center gap-3">
          <FYFilter
            countryCode={effectiveCountry}
            selectedFY={fy}
            basePath="/invoices"
            extraParams={{ profile, status }}
          />
          <Button asChild>
            <Link href="/invoices/new">
              <Plus size={16} className="mr-2" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      <ProfileFilter
        profiles={profiles}
        selectedProfile={profile}
        basePath="/invoices"
        extraParams={{ status, fy }}
      />

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const params = new URLSearchParams({ status: tab.key });
          if (profile) params.set("profile", profile);
          if (fy) params.set("fy", fy);
          return (
          <Link
            key={tab.key}
            href={`/invoices?${params.toString()}`}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`text-[11px] font-medium rounded-full px-1.5 py-0.5 leading-none ${
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </Link>
          );
        })}
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">No invoices found.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/invoices/new">Create invoice</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issue Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInvoices.map((inv) => {
                const isOverdue = (inv.status === "sent" || inv.status === "partial") && inv.due_date < today;
                return (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-mono font-medium hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.issue_date}</td>
                    <td className={`px-4 py-3 ${isOverdue ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                      {inv.due_date || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(inv.total, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={isOverdue ? "overdue" : inv.status} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-100 text-blue-700",
    partial: "bg-orange-100 text-orange-700",
    paid: "bg-green-100 text-green-700",
    void: "bg-red-100 text-red-700",
    overdue: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? map.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
