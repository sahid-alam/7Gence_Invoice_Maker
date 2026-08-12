"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, CreditCard, Bitcoin, Smartphone, Globe } from "lucide-react";
import { createPaymentMethod, deletePaymentMethod } from "@/actions/payment-methods";
import { parseWiseDetails, type ParsedWise } from "@/lib/wise";

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
  details?: { label: string; value: string }[] | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bank_transfer: <CreditCard size={14} />,
  crypto_wallet: <Bitcoin size={14} />,
  upi: <Smartphone size={14} />,
  wise: <Globe size={14} />,
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
  const [wise, setWise] = useState<ParsedWise | null>(null);
  const [wiseError, setWiseError] = useState<string | null>(null);

  function handleWisePaste(text: string) {
    if (!text.trim()) {
      setWise(null);
      setWiseError(null);
      return;
    }
    try {
      setWise(parseWiseDetails(text));
      setWiseError(null);
    } catch (err) {
      setWise(null);
      setWiseError(err instanceof Error ? err.message : "Couldn't read those details");
    }
  }

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
            {pm.type === "wise" && (
              <>
                {pm.account_holder_name && <p>Beneficiary: {pm.account_holder_name}</p>}
                {pm.details?.map((f) => (
                  <p key={f.label}>{f.label}: <span className="font-mono">{f.value}</span></p>
                ))}
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
                    { value: "wise", label: "Wise" },
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
                <Input
                  id="label"
                  name="label"
                  // Re-mounts to pick up the currency as soon as a Wise block is pasted.
                  key={wise?.currency ?? "label"}
                  defaultValue={wise?.currency ? `Wise ${wise.currency}` : ""}
                  placeholder={selectedType === "crypto_wallet" ? "Binance USDT" : selectedType === "bank_transfer" ? "HDFC Savings" : selectedType === "wise" ? "Wise USD" : "Personal UPI"}
                  required
                />
              </div>

              {selectedType === "wise" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="wise_paste">Paste your Wise account details</Label>
                    <Textarea
                      id="wise_paste"
                      name="wise_paste"
                      rows={8}
                      className="font-mono text-xs"
                      placeholder={"Here are the USD account details for … on Wise.\n\nName: …\nRouting number (for wire and ACH): …\nAccount number: …\nSwift/BIC: …"}
                      onChange={(e) => handleWisePaste(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Copy the whole block from Wise — one currency at a time. The &ldquo;Use when sending money from…&rdquo; hints are stripped out.
                    </p>
                  </div>

                  {wiseError && <p className="text-xs text-destructive">{wiseError}</p>}

                  {wise && (
                    <div className="rounded border bg-muted/40 p-3 space-y-1">
                      <p className="text-xs font-medium">
                        This is what appears on the invoice{wise.currency ? ` (${wise.currency})` : ""}:
                      </p>
                      <p className="text-xs">
                        <span className="text-muted-foreground">Beneficiary: </span>
                        {wise.name ?? <span className="text-destructive">missing — no &ldquo;Name:&rdquo; line found</span>}
                      </p>
                      {wise.fields.map((f) => (
                        <p key={f.label} className="text-xs">
                          <span className="text-muted-foreground">{f.label}: </span>
                          <span className="font-mono">{f.value}</span>
                        </p>
                      ))}
                      {wise.name && (
                        <p className="text-xs text-muted-foreground pt-1">
                          Beneficiary must match your GST-registered legal name, or the wire and FIRC won&apos;t match.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

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
