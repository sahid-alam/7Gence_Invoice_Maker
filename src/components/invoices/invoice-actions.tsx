"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MoreHorizontal, Send, DollarSign, XCircle, Trash2, Mail, Pencil, Plus, X, Undo2 } from "lucide-react";
import { updateInvoiceStatus, unsendInvoice, deleteInvoice, deleteInvoiceForce } from "@/actions/invoices";
import { recordPayment, getOutstandingInvoices } from "@/actions/payments";
import { sendInvoiceEmail } from "@/actions/email";
import { formatCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  paid_amount?: number | null;
  currency: string;
  client_name: string;
  client_email?: string | null;
  business_profile_id: string;
}

interface SplitRow {
  invoice_id: string;
  invoice_number: string;
  amount: string;
}

interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  paid_amount: number | null;
  currency: string;
}

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const [loading, setLoading]                     = useState(false);
  const [showDeleteDialog, setShowDelete]         = useState(false);
  const [password, setPassword]                   = useState("");
  const [verifying, setVerifying]                 = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Payment form state
  const [payerName, setPayerName]               = useState("");
  const [paymentDate, setPaymentDate]           = useState("");
  const [paymentMode, setPaymentMode]           = useState("bank_transfer");
  const [reference, setReference]               = useState("");
  const [receivedAmount, setReceivedAmount]     = useState("");
  const [receivedCurrency, setReceivedCurrency] = useState("INR");
  const [paymentNotes, setPaymentNotes]         = useState("");
  const [splits, setSplits]                     = useState<SplitRow[]>([]);

  // Outstanding invoices for split selection
  const [available, setAvailable]               = useState<OutstandingInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices]   = useState(false);

  const router = useRouter();
  const remaining = invoice.total - (invoice.paid_amount ?? 0);

  function openPaymentDialog() {
    setPayerName(invoice.client_name);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMode("bank_transfer");
    setReference("");
    setReceivedAmount("");
    setReceivedCurrency("INR");
    setPaymentNotes("");
    setSplits([{
      invoice_id: invoice.id,
      invoice_number: "",
      amount: String(Math.round(remaining * 100) / 100),
    }]);
    setAvailable([]);
    setShowPaymentDialog(true);
  }

  async function loadAvailableInvoices() {
    if (available.length > 0) return;
    setLoadingInvoices(true);
    try {
      const data = await getOutstandingInvoices(invoice.business_profile_id, invoice.currency);
      setAvailable(data);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }

  function addSplitRow() {
    loadAvailableInvoices();
    setSplits((prev) => [...prev, { invoice_id: "", invoice_number: "", amount: "" }]);
  }

  function removeSplitRow(idx: number) {
    setSplits((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSplitAmount(idx: number, value: string) {
    setSplits((prev) => prev.map((r, i) => i === idx ? { ...r, amount: value } : r));
  }

  function updateSplitInvoice(idx: number, invoiceId: string) {
    const inv = available.find((i) => i.id === invoiceId);
    if (!inv) return;
    const rem = inv.total - (inv.paid_amount ?? 0);
    setSplits((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { invoice_id: inv.id, invoice_number: inv.invoice_number, amount: String(Math.round(rem * 100) / 100) }
          : r
      )
    );
  }

  const computedTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await recordPayment({
        business_profile_id: invoice.business_profile_id,
        payer_name: payerName,
        total_amount: computedTotal,
        currency: invoice.currency,
        received_amount: receivedAmount ? parseFloat(receivedAmount) : undefined,
        received_currency: receivedAmount ? receivedCurrency : undefined,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        reference: reference || undefined,
        notes: paymentNotes || undefined,
        splits: splits
          .filter((s) => s.invoice_id && parseFloat(s.amount) > 0)
          .map((s) => ({ invoice_id: s.invoice_id, amount_applied: parseFloat(s.amount) })),
      });
      toast.success("Payment recorded");
      setShowPaymentDialog(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: () => Promise<void>, successMsg: string) {
    setLoading(true);
    try {
      await action();
      toast.success(successMsg);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    setLoading(true);
    try {
      const res = await sendInvoiceEmail(invoice.id);
      if (res.ok) toast.success(`Email sent to ${res.sentTo}`);
      else toast.error(res.message, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifiedDelete(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast.error("Could not identify user");
      setVerifying(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error) {
      toast.error("Incorrect password");
      setVerifying(false);
      return;
    }
    try {
      await deleteInvoiceForce(invoice.id);
      toast.success("Invoice deleted");
      router.push("/invoices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setVerifying(false);
    }
  }

  // Invoices already selected in other split rows (excluding the current row)
  const selectedIds = splits.filter((s) => s.invoice_id).map((s) => s.invoice_id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {invoice.status === "draft" && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/invoices/${invoice.id}/edit`}>
                  <Pencil size={14} className="mr-2" /> Edit Invoice
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAction(
                  () => updateInvoiceStatus(invoice.id, "sent"),
                  "Invoice marked as sent"
                )}
              >
                <Send size={14} className="mr-2" /> Mark as Sent
              </DropdownMenuItem>
            </>
          )}
          {invoice.status === "sent" && (
            <DropdownMenuItem
              onClick={() => handleAction(
                () => unsendInvoice(invoice.id),
                "Moved back to draft — edit and send again"
              )}
            >
              <Undo2 size={14} className="mr-2" /> Move back to Draft
            </DropdownMenuItem>
          )}
          {(invoice.status === "sent" || invoice.status === "partial") && (
            <>
              <DropdownMenuItem onClick={openPaymentDialog}>
                <DollarSign size={14} className="mr-2 text-green-600" /> Record Payment
              </DropdownMenuItem>
              {invoice.client_email && (
                <DropdownMenuItem onClick={handleSendEmail}>
                  <Mail size={14} className="mr-2 text-blue-500" /> Email Client
                </DropdownMenuItem>
              )}
            </>
          )}
          {(invoice.status === "draft" || invoice.status === "sent" || invoice.status === "partial") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => handleAction(
                  () => updateInvoiceStatus(invoice.id, "void"),
                  "Invoice voided"
                )}
              >
                <XCircle size={14} className="mr-2" /> Void Invoice
              </DropdownMenuItem>
            </>
          )}
          {/* Void belongs here too: a cancelled invoice has no financial effect, and
              without this there was no way to remove one at all — which also made its
              sender profile undeletable, since invoices block that. */}
          {(invoice.status === "draft" || invoice.status === "void") && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleAction(
                () => deleteInvoice(invoice.id),
                "Invoice deleted"
              )}
            >
              <Trash2 size={14} className="mr-2" />
              {invoice.status === "void" ? "Delete Invoice" : "Delete Draft"}
            </DropdownMenuItem>
          )}
          {(invoice.status === "paid" || invoice.status === "partial") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => { setShowDelete(true); setPassword(""); }}
              >
                <Trash2 size={14} className="mr-2" /> Delete Invoice
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Record Payment dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Remaining: {formatCurrency(remaining, invoice.currency)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payer-name">Payer Name</Label>
                <Input
                  id="payer-name"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reference">Reference (optional)</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={paymentMode === "upi" ? "UPI ref" : paymentMode === "crypto" ? "0x... | UTR-123" : "UTR / ref"}
                />
              </div>
            </div>

            {/* Shown for every payment mode, not just crypto. This is the figure the
                dashboard's earnings total is built from — if it isn't captured here,
                the payment shows up as "needs settlement" until someone fills it in. */}
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="received-amount">Amount credited to your bank</Label>
                {invoice.currency !== "INR" && (
                  <span className="text-[11px] text-muted-foreground">after conversion &amp; fees</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="received-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(e.target.value)}
                  placeholder={invoice.currency === "INR" ? String(computedTotal || "") : "e.g. 41500"}
                />
                <Input
                  id="received-currency"
                  value={receivedCurrency}
                  onChange={(e) => setReceivedCurrency(e.target.value.toUpperCase())}
                  placeholder="INR"
                  maxLength={3}
                  aria-label="Currency credited"
                />
              </div>
              {invoice.currency === "INR" && computedTotal > 0 && (
                <button
                  type="button"
                  onClick={() => { setReceivedAmount(String(computedTotal)); setReceivedCurrency("INR"); }}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Same as the {formatCurrency(computedTotal, invoice.currency)} received
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Leave blank if you don&apos;t know yet — you can fill it in from the Payments page later.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Input
                id="payment-notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Any additional notes"
              />
            </div>

            {/* Invoice splits */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice Splits</Label>
              {splits.map((split, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {idx === 0 ? (
                    <div className="flex-1 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm font-mono text-muted-foreground">
                      {invoice.invoice_number}
                    </div>
                  ) : (
                    <Select
                      value={split.invoice_id}
                      onValueChange={(val) => updateSplitInvoice(idx, val)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingInvoices ? (
                          <SelectItem value="_loading" disabled>Loading…</SelectItem>
                        ) : (
                          available
                            .filter((inv) => inv.id === split.invoice_id || !selectedIds.includes(inv.id))
                            .map((inv) => {
                              const due = inv.total - (inv.paid_amount ?? 0);
                              const label = `${inv.invoice_number} · ${inv.client_name} — ${formatCurrency(due, inv.currency)} due`;
                              return (
                                <SelectItem key={inv.id} value={inv.id} textValue={label}>
                                  <span className="font-mono">{inv.invoice_number}</span>
                                  <span className="text-muted-foreground ml-2">· {inv.client_name}</span>
                                  <span className="text-muted-foreground ml-2">— {formatCurrency(due, inv.currency)} due</span>
                                </SelectItem>
                              );
                            })
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-28"
                    value={split.amount}
                    onChange={(e) => updateSplitAmount(idx, e.target.value)}
                    placeholder="Amount"
                    required
                  />
                  {idx > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSplitRow(idx)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={addSplitRow}
              >
                <Plus size={12} className="mr-1" /> Add invoice to this payment
              </Button>
            </div>

            {splits.length > 1 && (
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(computedTotal, invoice.currency)}</span>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentDialog(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !payerName || !paymentDate || splits.some((s) => !s.invoice_id || !parseFloat(s.amount))}
              >
                {loading ? "Recording…" : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password-verification dialog for deletion */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete invoice?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVerifiedDelete} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDelete(false)}
                disabled={verifying}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={verifying || !password}
              >
                {verifying ? "Verifying…" : "Delete"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
