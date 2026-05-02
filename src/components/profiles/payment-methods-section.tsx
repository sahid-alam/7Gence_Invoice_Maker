"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, CreditCard, Bitcoin, Smartphone } from "lucide-react";
import { createPaymentMethod, deletePaymentMethod } from "@/actions/payment-methods";

interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  is_default: boolean;
  bank_name?: string | null;
  account_number?: string | null;
  wallet_address?: string | null;
  coin?: string | null;
  network?: string | null;
  upi_id?: string | null;
  account_name?: string | null;
  account_holder_name?: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bank_transfer: <CreditCard size={14} />,
  crypto_wallet: <Bitcoin size={14} />,
  upi: <Smartphone size={14} />,
};

export function PaymentMethodsSection({
  profileId,
  paymentMethods: initial,
}: {
  profileId: string;
  paymentMethods: PaymentMethod[];
}) {
  const [methods, setMethods] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState("bank_transfer");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      await createPaymentMethod(profileId, formData);
      toast.success("Payment method added");
      setShowForm(false);
      // Refresh via reload
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePaymentMethod(id, profileId);
      setMethods((prev) => prev.filter((m) => m.id !== id));
      toast.success("Payment method removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4">
      {methods.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">No payment methods added yet.</p>
      )}

      {methods.map((pm) => (
        <Card key={pm.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                {TYPE_ICONS[pm.type]}
                {pm.label}
                {pm.is_default && (
                  <span className="text-xs font-normal bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                    Default
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-7 w-7"
                onClick={() => handleDelete(pm.id)}
              >
                <Trash2 size={12} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-0.5">
            {pm.type === "bank_transfer" && (
              <>
                {pm.bank_name && <p>Bank: {pm.bank_name}</p>}
                {pm.account_number && <p>Account: {pm.account_number}</p>}
                {pm.account_holder_name && <p>Name: {pm.account_holder_name}</p>}
              </>
            )}
            {pm.type === "crypto_wallet" && (
              <>
                {pm.coin && pm.network && <p>{pm.coin} / {pm.network}</p>}
                {pm.wallet_address && <p className="font-mono break-all">{pm.wallet_address}</p>}
                {pm.account_name && <p>Account: {pm.account_name}</p>}
              </>
            )}
            {pm.type === "upi" && pm.upi_id && <p>UPI: {pm.upi_id}</p>}
          </CardContent>
        </Card>
      ))}

      {showForm ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">Add Payment Method</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {[
                    { value: "bank_transfer", label: "Bank Transfer" },
                    { value: "crypto_wallet", label: "Crypto Wallet" },
                    { value: "upi", label: "UPI" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                        selectedType === t.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent"
                      }`}
                      onClick={() => setSelectedType(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="type" value={selectedType} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="label">Label (display name)</Label>
                <Input id="label" name="label" placeholder={selectedType === "crypto_wallet" ? "Binance USDT" : selectedType === "bank_transfer" ? "HDFC Savings" : "Personal UPI"} required />
              </div>

              {selectedType === "bank_transfer" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Account Holder Name</Label>
                    <Input name="account_holder_name" placeholder="Sahid Alam" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input name="bank_name" placeholder="HDFC Bank" />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input name="account_number" placeholder="1234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label>IFSC Code</Label>
                    <Input name="ifsc_code" placeholder="HDFC0001234" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>SWIFT Code (for international)</Label>
                    <Input name="swift_code" placeholder="HDFCINBB" />
                  </div>
                </div>
              )}

              {selectedType === "crypto_wallet" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Coin</Label>
                      <Input name="coin" placeholder="USDT" defaultValue="USDT" />
                    </div>
                    <div className="space-y-2">
                      <Label>Network</Label>
                      <Input name="network" placeholder="BEP20 / TRC20 / ERC20" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Wallet Address</Label>
                    <Input name="wallet_address" placeholder="0x..." className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Name (optional)</Label>
                    <Input name="account_name" placeholder="SahidAlam7Gence" />
                  </div>
                </div>
              )}

              {selectedType === "upi" && (
                <div className="space-y-2">
                  <Label>UPI ID</Label>
                  <Input name="upi_id" placeholder="sahid@upi" />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_default" name="is_default" className="rounded" />
                <Label htmlFor="is_default">Set as default payment method</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={loading}>{loading ? "Adding..." : "Add"}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-2" />
          Add Payment Method
        </Button>
      )}
    </div>
  );
}
