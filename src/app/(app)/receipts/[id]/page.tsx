import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";
import { ExportReceiptToDriveButton } from "@/components/integrations/export-receipt-to-drive-button";
import { DeleteReceiptButton } from "@/components/receipts/delete-receipt-button";
import { ArrowLeft, Download } from "lucide-react";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [receiptRes, driveTokenRes] = await Promise.all([
    supabase
      .from("receipts")
      .select(`*, drive_url, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url), invoices(invoice_number)`)
      .eq("id", id)
      .single(),
    supabase
      .from("oauth_tokens")
      .select("id")
      .eq("provider", "google_drive")
      .single(),
  ]);

  if (!receiptRes.data) notFound();
  const receipt = receiptRes.data;
  const driveConnected = !!driveTokenRes.data;

  const pm = receipt.payment_method_snapshot as Record<string, string> | null;
  const profile = receipt.business_profiles as Record<string, string> | null;
  const linkedInvoiceNumber = (receipt.invoices as { invoice_number: string } | null)?.invoice_number ?? null;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/receipts"><ArrowLeft size={16} /></Link>
          </Button>
          <h2 className="text-xl font-bold font-mono">{receipt.receipt_number}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/receipts/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download size={14} className="mr-2" />
              Download PDF
            </a>
          </Button>
          {driveConnected && <ExportReceiptToDriveButton receiptId={id} driveUrl={receipt.drive_url} />}
          <DeleteReceiptButton receiptId={id} receiptNumber={receipt.receipt_number} />
        </div>
      </div>

      <Separator />

      {/* Receipt Preview — hardcoded white like invoice */}
      <div className="rounded-lg border border-gray-200 p-8 space-y-8 bg-white text-gray-900 shadow-sm dark:shadow-[0_4px_48px_rgba(0,0,0,0.5)]">
        {/* Title row */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold tracking-widest uppercase text-gray-900">Receipt</h1>
            <p className="text-gray-400 mt-1 font-mono text-sm">#{receipt.receipt_number}</p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p className="text-gray-400 text-xs uppercase tracking-wider">Payment Date</p>
            <p className="font-semibold text-gray-900 mt-0.5">{receipt.payment_date}</p>
          </div>
        </div>

        <div className="h-px bg-gray-200" />

        {/* From / Received From */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">From</p>
            <p className="font-semibold text-gray-900">{profile?.display_name}</p>
            {profile?.address_line1 && <p className="text-sm text-gray-500">{profile.address_line1}</p>}
            {profile?.city && <p className="text-sm text-gray-500">{profile.city}</p>}
            {profile?.email && <p className="text-sm text-gray-500">{profile.email}</p>}
            {profile?.gstin && <p className="text-xs text-gray-400 mt-1">GSTIN: {profile.gstin}</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Received From</p>
            <p className="font-semibold text-gray-900">{receipt.client_name}</p>
            {receipt.client_company && <p className="text-sm text-gray-500">{receipt.client_company}</p>}
            {receipt.client_address && <p className="text-sm text-gray-500">{receipt.client_address}</p>}
          </div>
        </div>

        <div className="h-px bg-gray-200" />

        {/* Amount received — prominent */}
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Payment For</p>
            {receipt.invoice_id && linkedInvoiceNumber ? (
              <p className="text-sm text-gray-600">
                Invoice{" "}
                <Link
                  href={`/invoices/${receipt.invoice_id}`}
                  className="underline text-gray-900 hover:text-gray-600"
                >
                  #{linkedInvoiceNumber}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-gray-500">Standalone payment</p>
            )}
            {receipt.notes && (
              <p className="text-sm text-gray-500 mt-1">{receipt.notes}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Amount Received</p>
            <p className="text-4xl font-bold text-gray-900 mt-1">
              {formatCurrency(receipt.amount, receipt.currency)}
            </p>
            <p className="text-sm text-gray-400 mt-0.5">{receipt.currency}</p>
          </div>
        </div>

        {/* Payment method */}
        {pm && (
          <>
            <div className="h-px bg-gray-200" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Via</p>
              {pm.type === "crypto_wallet" && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">
                    {pm.coin} ({pm.network})
                  </p>
                  <p className="font-mono text-xs break-all text-gray-500">{pm.wallet_address}</p>
                  {pm.account_name && <p className="text-gray-500">Account: {pm.account_name}</p>}
                </div>
              )}
              {pm.type === "bank_transfer" && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">Bank Transfer — {pm.bank_name}</p>
                  <p className="text-gray-500">Account: {pm.account_number}</p>
                  {pm.ifsc_code && <p className="text-gray-500">IFSC: {pm.ifsc_code}</p>}
                  {pm.account_holder_name && <p className="text-gray-500">Name: {pm.account_holder_name}</p>}
                </div>
              )}
              {pm.type === "upi" && (
                <div className="text-sm">
                  <p className="font-medium text-gray-900">UPI</p>
                  <p className="text-gray-500">{pm.upi_id}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
