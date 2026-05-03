import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { ExportToDriveButton } from "@/components/integrations/export-to-drive-button";
import { ArrowLeft, Download } from "lucide-react";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceRes, itemsRes, driveTokenRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(`*, drive_url, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)`)
      .eq("id", id)
      .single(),
    supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase
      .from("oauth_tokens")
      .select("id")
      .eq("provider", "google_drive")
      .single(),
  ]);

  if (!invoiceRes.data) notFound();

  const invoice = invoiceRes.data;
  const items = itemsRes.data ?? [];
  const driveConnected = !!driveTokenRes.data;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = invoice.status === "sent" && invoice.due_date < today;

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    void: "bg-red-100 text-red-700",
  };

  const pm = invoice.payment_method_snapshot as Record<string, string> | null;

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices"><ArrowLeft size={16} /></Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold font-mono">{invoice.invoice_number}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[invoice.status]}`}>
                {isOverdue ? "Overdue" : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download size={14} className="mr-2" />
              Download PDF
            </a>
          </Button>
          {driveConnected && <ExportToDriveButton invoiceId={id} driveUrl={invoice.drive_url} />}
          <InvoiceActions invoice={invoice} />
        </div>
      </div>

      <Separator />

      {/* Invoice Preview — all colors hardcoded so it looks like paper in both themes */}
      {(() => {
        const isCream = invoice.template_id === "cream-serif";
        const bg = isCream ? "bg-[#F5F0E8]" : "bg-white";
        const divider = isCream ? "bg-[#D4CFC5]" : "bg-gray-200";
        const border = isCream ? "border-[#D4CFC5]" : "border-gray-200";
        return (
      <div className={`rounded-lg border ${border} p-8 space-y-8 ${bg} text-gray-900 shadow-sm dark:shadow-[0_4px_48px_rgba(0,0,0,0.5)]`}>
        {/* Title */}
        <div className="flex justify-between items-start">
          <div>
            {isCream ? (
              <h1 className="text-5xl font-bold font-serif text-gray-900 leading-none">Invoice</h1>
            ) : (
              <h1 className="text-4xl font-bold tracking-widest uppercase text-gray-900">Invoice</h1>
            )}
            <p className={`mt-2 text-sm ${isCream ? "text-[#777]" : "text-gray-400 font-mono"}`}>#{invoice.invoice_number}</p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Issued: {invoice.issue_date}</p>
            {invoice.due_date && (
              <p className={isOverdue ? "text-amber-600 font-medium" : ""}>Due: {invoice.due_date}</p>
            )}
          </div>
        </div>

        <div className={`h-px ${divider}`} />

        {/* From / To */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">From</p>
            <p className="font-semibold text-gray-900">{(invoice.business_profiles as Record<string, string>)?.display_name}</p>
            {(invoice.business_profiles as Record<string, string>)?.address_line1 && (
              <p className="text-sm text-gray-500">{(invoice.business_profiles as Record<string, string>).address_line1}</p>
            )}
            {(invoice.business_profiles as Record<string, string>)?.email && (
              <p className="text-sm text-gray-500">{(invoice.business_profiles as Record<string, string>).email}</p>
            )}
            {invoice.sender_gstin && (
              <p className="text-xs text-gray-400 mt-1">GSTIN: {invoice.sender_gstin}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">To</p>
            <p className="font-semibold text-gray-900">{invoice.client_name}</p>
            {invoice.client_company && <p className="text-sm text-gray-500">{invoice.client_company}</p>}
            {invoice.client_address && <p className="text-sm text-gray-500">{invoice.client_address}</p>}
            {invoice.client_email && <p className="text-sm text-gray-500">{invoice.client_email}</p>}
            {invoice.client_gstin && (
              <p className="text-xs text-gray-400 mt-1">GSTIN: {invoice.client_gstin}</p>
            )}
          </div>
        </div>

        <div className={`h-px ${divider}`} />

        {/* Items */}
        <table className="w-full text-sm">
          <thead>
            <tr className={isCream ? "border-b border-[#D4CFC5]" : "border-b border-gray-200"}>
              <th className="text-left py-2 font-semibold uppercase tracking-wider text-xs text-gray-400">Description</th>
              <th className="text-right py-2 font-semibold uppercase tracking-wider text-xs text-gray-400">Qty</th>
              <th className="text-right py-2 font-semibold uppercase tracking-wider text-xs text-gray-400">Price</th>
              <th className="text-right py-2 font-semibold uppercase tracking-wider text-xs text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody className={isCream ? "divide-y divide-[#D4CFC5]" : "divide-y divide-gray-100"}>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-3 text-gray-900">{item.description}</td>
                <td className="py-3 text-right text-gray-500">{item.quantity}</td>
                <td className="py-3 text-right text-gray-500">{formatCurrency(item.unit_price, invoice.currency)}</td>
                <td className="py-3 text-right font-medium text-gray-900">{formatCurrency(item.quantity * item.unit_price, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Discount</span>
                <span className="text-green-600">−{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
              </div>
            )}
            {invoice.tax_type === "cgst_sgst" && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">CGST ({Number(invoice.cgst_rate) * 100}%)</span>
                  <span className="text-gray-900">{formatCurrency(invoice.tax_amount / 2, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">SGST ({Number(invoice.sgst_rate) * 100}%)</span>
                  <span className="text-gray-900">{formatCurrency(invoice.tax_amount / 2, invoice.currency)}</span>
                </div>
              </>
            )}
            {(invoice.tax_type === "igst" || invoice.tax_type === "custom") && invoice.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  {invoice.tax_type === "igst" ? "IGST" : "Tax"} ({Number(invoice.tax_rate) * 100}%)
                </span>
                <span className="text-gray-900">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
            )}
            <div className={`h-px ${divider}`} />
            <div className="flex justify-between font-bold text-base text-gray-900">
              <span>Total Due</span>
              <span>{formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        {pm && (
          <>
            <div className={`h-px ${divider}`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Payment Method</p>
              {pm.type === "crypto_wallet" && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">Payment to Wallet ({pm.coin} / {pm.network})</p>
                  <p className="font-mono text-xs break-all text-gray-500">{pm.wallet_address}</p>
                  {pm.account_name && <p className="text-gray-500">Account: {pm.account_name}</p>}
                </div>
              )}
              {pm.type === "bank_transfer" && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">Bank Transfer — {pm.bank_name}</p>
                  <p className="text-gray-500">Account: {pm.account_number}</p>
                  {pm.ifsc_code && <p className="text-gray-500">IFSC: {pm.ifsc_code}</p>}
                  {pm.swift_code && <p className="text-gray-500">SWIFT: {pm.swift_code}</p>}
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

        {/* Notes */}
        {invoice.notes && (
          <>
            <div className={`h-px ${divider}`} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Notes</p>
              <p className="text-sm text-gray-500">{invoice.notes}</p>
            </div>
          </>
        )}
      </div>
      );
    })()}
    </div>
  );
}
