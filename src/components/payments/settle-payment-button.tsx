"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { updatePaymentSettlement, clearPaymentSettlement } from "@/actions/payments";
import { formatCurrency } from "@/lib/currency";
import { HOME_CURRENCY } from "@/lib/earnings";

/**
 * Records what actually hit the bank for one payment. Offered on ANY unsettled
 * payment — it used to appear only for crypto, which left every foreign bank
 * transfer permanently unaccounted for in the earnings total.
 */
export function SettlePaymentButton({
  paymentId,
  paidCurrency,
  paidAmount,
  settled = false,
  label = "Settle",
}: {
  paymentId: string;
  /** Currency the client paid in. */
  paidCurrency: string;
  /** Amount the client paid, used for the same-amount shortcut. */
  paidAmount: number;
  /** Already has a settlement — this is an edit, not a first entry. */
  settled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(HOME_CURRENCY);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const sameCurrency = paidCurrency.toUpperCase() === HOME_CURRENCY;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!currency.trim()) {
      toast.error("Enter the currency it landed in");
      return;
    }
    setLoading(true);
    try {
      await updatePaymentSettlement(paymentId, parsed, currency, date || undefined);
      toast.success("Settlement recorded");
      setOpen(false);
      setAmount("");
      setDate("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setLoading(true);
    try {
      await clearPaymentSettlement(paymentId);
      toast.success("Settlement cleared — payment is back to not settled");
      setOpen(false);
      setAmount("");
      setDate("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
        onClick={() => setOpen(true)}
      >
        <CheckCircle size={11} className="mr-1" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{settled ? "Update settlement" : "Amount credited to your bank"}</DialogTitle>
            <DialogDescription>
              Client paid {formatCurrency(paidAmount, paidCurrency)}. Enter what actually
              landed, after conversion and fees — this is what counts as earnings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount credited</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={sameCurrency ? String(paidAmount) : "e.g. 41500"}
                  className="h-8 text-sm"
                  required
                  autoFocus
                />
              </div>
              <div className="w-24 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder={HOME_CURRENCY}
                  className="h-8 font-mono text-sm"
                  maxLength={5}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date it reached your bank</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Decides which financial year this counts in — use the date on your bank
                statement, not the date the client paid.
              </p>
            </div>

            {sameCurrency && (
              <button
                type="button"
                onClick={() => { setAmount(String(paidAmount)); setCurrency(HOME_CURRENCY); }}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Same as paid — {formatCurrency(paidAmount, paidCurrency)}
              </button>
            )}

            <DialogFooter className="sm:justify-between">
              {settled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleClear}
                >
                  Clear settlement
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={loading}>
                  {loading ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
