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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MoreHorizontal, Send, DollarSign, XCircle, Trash2, Mail, Pencil } from "lucide-react";
import { updateInvoiceStatus, deleteInvoice, deleteInvoiceForce, recordPayment } from "@/actions/invoices";
import { sendInvoiceEmail } from "@/actions/email";
import { formatCurrency } from "@/lib/currency";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Invoice {
  id: string;
  status: string;
  total: number;
  paid_amount?: number | null;
  currency: string;
  client_email?: string | null;
}

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const [loading, setLoading]                     = useState(false);
  const [showDeleteDialog, setShowDelete]         = useState(false);
  const [password, setPassword]                   = useState("");
  const [verifying, setVerifying]                 = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount]         = useState("");
  const [paymentDate, setPaymentDate]             = useState("");
  const [paymentNotes, setPaymentNotes]           = useState("");
  const router = useRouter();

  const remaining = invoice.total - (invoice.paid_amount ?? 0);

  function openPaymentDialog() {
    setPaymentAmount(String(Math.round(remaining * 100) / 100));
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentNotes("");
    setShowPaymentDialog(true);
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
      await sendInvoiceEmail(invoice.id);
      toast.success("Email sent to client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await recordPayment(invoice.id, Number(paymentAmount), paymentDate, paymentNotes || undefined);
      toast.success("Payment recorded");
      setShowPaymentDialog(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
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
          {invoice.status === "draft" && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleAction(
                () => deleteInvoice(invoice.id),
                "Invoice deleted"
              )}
            >
              <Trash2 size={14} className="mr-2" /> Delete Draft
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Remaining: {formatCurrency(remaining, invoice.currency)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={String(Math.round(remaining * 100) / 100)}
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
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
            <div className="space-y-1.5">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Input
                id="payment-notes"
                type="text"
                placeholder="e.g. Wire transfer ref #1234"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentDialog(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !paymentAmount || !paymentDate}>
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
