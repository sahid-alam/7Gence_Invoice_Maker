import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";
import { ArrowLeft, Download } from "lucide-react";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from("receipts")
    .select(`*, business_profiles(display_name, email, phone, address_line1, city)`)
    .eq("id", id)
    .single();

  if (!receipt) notFound();

  const pm = receipt.payment_method_snapshot as Record<string, string> | null;
  const profile = receipt.business_profiles as Record<string, string> | null;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/receipts"><ArrowLeft size={16} /></Link>
          </Button>
          <h2 className="text-xl font-bold font-mono">{receipt.receipt_number}</h2>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/receipts/${id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Download size={14} className="mr-2" />
            Download PDF
          </a>
        </Button>
      </div>

      <Separator />

      <div className="rounded-lg border border-border p-8 space-y-6 bg-white">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-widest uppercase">Receipt</h1>
            <p className="text-muted-foreground font-mono mt-1">#{receipt.receipt_number}</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Payment Date</p>
            <p className="font-semibold">{receipt.payment_date}</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">From</p>
            <p className="font-semibold">{profile?.display_name}</p>
            {profile?.address_line1 && <p className="text-sm text-muted-foreground">{profile.address_line1}</p>}
            {profile?.email && <p className="text-sm text-muted-foreground">{profile.email}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Received From</p>
            <p className="font-semibold">{receipt.client_name}</p>
            {receipt.client_company && <p className="text-sm text-muted-foreground">{receipt.client_company}</p>}
            {receipt.client_address && <p className="text-sm text-muted-foreground">{receipt.client_address}</p>}
          </div>
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">Payment received for</p>
            {receipt.invoice_id && (
              <p className="text-sm">
                Invoice{" "}
                <Link href={`/invoices/${receipt.invoice_id}`} className="underline">
                  #{receipt.receipt_number.replace("REC-", "")}
                </Link>
              </p>
            )}
            {receipt.notes && <p className="text-sm text-muted-foreground mt-1">{receipt.notes}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Amount Received</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(receipt.amount, receipt.currency)}</p>
            <p className="text-sm text-muted-foreground">{receipt.currency}</p>
          </div>
        </div>

        {pm && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Via</p>
              {pm.type === "crypto_wallet" && (
                <p className="text-sm">{pm.coin} ({pm.network}) — <span className="font-mono text-xs">{pm.wallet_address}</span></p>
              )}
              {pm.type === "bank_transfer" && (
                <p className="text-sm">{pm.bank_name} — {pm.account_number}</p>
              )}
              {pm.type === "upi" && <p className="text-sm">UPI: {pm.upi_id}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
