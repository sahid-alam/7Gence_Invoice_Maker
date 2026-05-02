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
import { toast } from "sonner";
import { MoreHorizontal, Send, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { updateInvoiceStatus, deleteInvoice } from "@/actions/invoices";

interface Invoice {
  id: string;
  status: string;
  total: number;
}

export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const [loading, setLoading] = useState(false);
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

  return (
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
          <DropdownMenuItem
            onClick={() => handleAction(
              () => updateInvoiceStatus(invoice.id, "paid", invoice.total),
              "Invoice marked as paid — receipt created"
            )}
          >
            <CheckCircle2 size={14} className="mr-2 text-green-600" /> Mark as Paid
          </DropdownMenuItem>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
