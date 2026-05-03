import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [invoiceStats, recentInvoices, profiles] = await Promise.all([
    supabase
      .from("invoices")
      .select("status, total, currency, due_date, paid_at")
      .eq("owner_id", user!.id),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, total, currency, status, issue_date")
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("business_profiles")
      .select("id")
      .eq("owner_id", user!.id)
      .limit(1),
  ]);

  const invoices = invoiceStats.data ?? [];
  const today = new Date().toISOString().split("T")[0];

  const stats = {
    draft: invoices.filter((i) => i.status === "draft").length,
    sent: invoices.filter((i) => i.status === "sent" && i.due_date >= today).length,
    overdue: invoices.filter((i) => i.status === "sent" && i.due_date < today).length,
    paid: invoices.filter((i) => i.status === "paid").length,
  };

  const hasProfiles = (profiles.data?.length ?? 0) > 0;

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your invoices and receipts</p>
        </div>
        <div className="flex gap-3">
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

      {!hasProfiles && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Set up your business profile first to start creating invoices.{" "}
          <Link href="/profiles/new" className="font-medium underline">
            Create profile →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText size={14} /> Draft
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText size={14} /> Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.sent}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200/60 dark:border-amber-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
              <AlertCircle size={14} /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200/60 dark:border-green-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
              <CheckCircle2 size={14} /> Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.paid}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent Invoices</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices">View all →</Link>
          </Button>
        </div>
        {(recentInvoices.data?.length ?? 0) === 0 ? (
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
                {recentInvoices.data?.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    void: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
