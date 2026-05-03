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
import { MoreHorizontal, Send, CheckCircle2, XCircle, Trash2, Mail } from "lucide-react";
import { updateInvoiceStatus, deleteInvoice, deleteInvoiceForce } from "@/actions/invoices";
import { sendInvoiceEmail } from "@/actions/email";
import { createClient } from "@/lib/supabase/client";

interface Invoice {
  id: string;
  status: string;
  total: number;
  client_email?: string | null;
}

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const [loading, setLoading]               = useState(false);
  const [showDeleteDialog, setShowDelete]   = useState(false);
  const [password, setPassword]             = useState("");
  const [verifying, setVerifying]           = useState(false);
  const router = useRouter();

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
            <DropdownMenuItem
              onClick={() => handleAction(
                () => updateInvoiceStatus(invoice.id, "sent"),
                "Invoice marked as sent"
              )}
            >
              <Send size={14} className="mr-2" /> Mark as Sent
            </DropdownMenuItem>
          )}
          {invoice.status === "sent" && (
            <>
              <DropdownMenuItem
                onClick={() => handleAction(
                  () => updateInvoiceStatus(invoice.id, "paid", invoice.total),
                  "Invoice marked as paid — receipt created"
                )}
              >
                <CheckCircle2 size={14} className="mr-2 text-green-600" /> Mark as Paid
              </DropdownMenuItem>
              {invoice.client_email && (
                <DropdownMenuItem onClick={handleSendEmail}>
                  <Mail size={14} className="mr-2 text-blue-500" /> Email Client
                </DropdownMenuItem>
              )}
            </>
          )}
          {(invoice.status === "draft" || invoice.status === "sent") && (
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
          {invoice.status === "paid" && (
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

      {/* Password-verification dialog for paid invoice deletion */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete paid invoice?</DialogTitle>
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
