"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createInvoice, type CreateInvoiceInput } from "@/actions/invoices";
import { calculateTax } from "@/lib/tax-calculator";
import { formatCurrency, formatAmount } from "@/lib/currency";
import { GST_RATES, type TaxType, type CurrencyCode } from "@/types/app.types";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface Profile {
  id: string;
  display_name: string;
  default_currency: string;
  default_template_id: string;
  state?: string | null;
}

interface PaymentMethod {
  id: string;
  label: string;
  type: string;
}

interface ClientOption {
  id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  address_line1?: string | null;
  city?: string | null;
  country?: string | null;
  gstin?: string | null;
}

const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "AED", "INR", "USDT"];
const TEMPLATES = [
  { id: "white-caps", label: "White – Classic Caps" },
  { id: "cream-serif", label: "Cream – Modern Serif" },
];

export function InvoiceForm({
  profiles,
  clients,
}: {
  profiles: Profile[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const defaultProfile = profiles[0];

  const [profileId, setProfileId] = useState(defaultProfile?.id ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (defaultProfile?.default_currency as CurrencyCode) ?? "USD"
  );
  const [templateId, setTemplateId] = useState(defaultProfile?.default_template_id ?? "white-caps");

  // Client fields
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientGstin, setClientGstin] = useState("");

  // Dates
  const today = new Date().toISOString().split("T")[0];
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState("");

  // Line items
  const [items, setItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 },
  ]);

  // Tax
  const [taxType, setTaxType] = useState<TaxType>("none");
  const [taxRate, setTaxRate] = useState(18);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Payment
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const handleProfileChange = useCallback(
    async (newProfileId: string) => {
      setProfileId(newProfileId);
      const profile = profiles.find((p) => p.id === newProfileId);
      if (profile) {
        setCurrency((profile.default_currency as CurrencyCode) ?? "USD");
        setTemplateId(profile.default_template_id ?? "white-caps");
      }
      // Fetch payment methods for this profile
      const res = await fetch(`/api/payment-methods?profile_id=${newProfileId}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data);
        const def = data.find((pm: PaymentMethod & { is_default: boolean }) => pm.is_default);
        setPaymentMethodId(def?.id ?? "");
      }
    },
    [profiles]
  );

  const handleClientSelect = useCallback(
    (clientId: string) => {
      setSelectedClientId(clientId);
      if (!clientId) return;
      const client = clients.find((c) => c.id === clientId);
      if (client) {
        setClientName(client.name);
        setClientCompany(client.company_name ?? "");
        setClientEmail(client.email ?? "");
        const parts = [client.address_line1, client.city, client.country].filter(Boolean);
        setClientAddress(parts.join(", "));
        setClientGstin(client.gstin ?? "");
      }
    },
    [clients]
  );

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 },
    ]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const tax = calculateTax({ subtotal, tax_type: taxType, tax_rate: taxRate, discount_percent: discountPercent });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId) {
      toast.error("Please select a business profile");
      return;
    }
    if (!clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      toast.error("All line items need a description");
      return;
    }

    setLoading(true);
    try {
      const input: CreateInvoiceInput = {
        business_profile_id: profileId,
        client_id: selectedClientId || undefined,
        client_name: clientName,
        client_company: clientCompany || undefined,
        client_email: clientEmail || undefined,
        client_address: clientAddress || undefined,
        client_gstin: clientGstin || undefined,
        issue_date: issueDate,
        due_date: dueDate || undefined,
        currency,
        tax_type: taxType,
        tax_rate: taxRate,
        discount_percent: discountPercent,
        payment_method_id: paymentMethodId || undefined,
        template_id: templateId,
        notes: notes || undefined,
        terms: terms || undefined,
        items: items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      };
      await createInvoice(input);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Profile & Template */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Business Profile</Label>
          <Select value={profileId} onValueChange={handleProfileChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Client */}
      <div className="space-y-4">
        <h3 className="font-semibold">Bill To</h3>
        {clients.length > 0 && (
          <div className="space-y-2">
            <Label>Select saved client (optional)</Label>
            <Select value={selectedClientId} onValueChange={handleClientSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Search clients..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Enter manually —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name ? `${c.company_name} (${c.name})` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name *</Label>
            <Input
              id="client_name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_company">Company</Label>
            <Input
              id="client_company"
              value={clientCompany}
              onChange={(e) => setClientCompany(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_email">Email</Label>
            <Input
              id="client_email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_gstin">GSTIN (if Indian client)</Label>
            <Input
              id="client_gstin"
              value={clientGstin}
              onChange={(e) => setClientGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="client_address">Address</Label>
          <Textarea
            id="client_address"
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            placeholder="Street, City, Country"
            rows={2}
          />
        </div>
      </div>

      <Separator />

      {/* Dates & Currency */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="issue_date">Issue Date</Label>
          <Input
            id="issue_date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input
            id="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Line Items */}
      <div className="space-y-3">
        <h3 className="font-semibold">Line Items</h3>
        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
          <span className="col-span-6">Description</span>
          <span className="col-span-2 text-right">Qty</span>
          <span className="col-span-2 text-right">Unit Price</span>
          <span className="col-span-2 text-right">Amount</span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-6"
              value={item.description}
              onChange={(e) => updateItem(item.id, "description", e.target.value)}
              placeholder="Service description"
              required
            />
            <Input
              className="col-span-2 text-right"
              type="number"
              min="0.01"
              step="0.01"
              value={item.quantity}
              onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
            />
            <Input
              className="col-span-2 text-right"
              type="number"
              min="0"
              step="0.01"
              value={item.unit_price}
              onChange={(e) => updateItem(item.id, "unit_price", parseFloat(e.target.value) || 0)}
            />
            <div className="col-span-1 text-right text-sm font-medium">
              {formatAmount(item.quantity * item.unit_price)}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="col-span-1 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(item.id)}
              disabled={items.length === 1}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus size={14} className="mr-2" />
          Add item
        </Button>
      </div>

      <Separator />

      {/* Tax & Totals */}
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="font-semibold">Tax</h3>
          <div className="space-y-2">
            <Label>Tax Type</Label>
            <Select value={taxType} onValueChange={(v) => setTaxType(v as TaxType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Tax / Tax Exempt</SelectItem>
                <SelectItem value="cgst_sgst">CGST + SGST (Intrastate India)</SelectItem>
                <SelectItem value="igst">IGST (Interstate / International)</SelectItem>
                <SelectItem value="custom">Custom %</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {taxType !== "none" && (
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              {taxType === "cgst_sgst" || taxType === "igst" ? (
                <Select
                  value={String(taxRate)}
                  onValueChange={(v) => setTaxRate(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                />
              )}
              {taxType === "cgst_sgst" && (
                <p className="text-xs text-muted-foreground">
                  CGST {taxRate / 2}% + SGST {taxRate / 2}%
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Discount (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="space-y-3 pt-8">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(tax.subtotal, currency)}</span>
          </div>
          {tax.discount_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount ({discountPercent}%)</span>
              <span className="text-green-600">−{formatCurrency(tax.discount_amount, currency)}</span>
            </div>
          )}
          {taxType === "cgst_sgst" && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST ({taxRate / 2}%)</span>
                <span>{formatCurrency(tax.cgst_amount, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST ({taxRate / 2}%)</span>
                <span>{formatCurrency(tax.sgst_amount, currency)}</span>
              </div>
            </>
          )}
          {(taxType === "igst" || taxType === "custom") && tax.tax_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {taxType === "igst" ? `IGST (${taxRate}%)` : `Tax (${taxRate}%)`}
              </span>
              <span>{formatCurrency(tax.tax_amount, currency)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>{formatCurrency(tax.total, currency)}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Payment & Notes */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-semibold">Payment Method</h3>
          {paymentMethods.length > 0 ? (
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              No payment methods. <a href={`/profiles/${profileId}`} className="underline">Add one in your profile.</a>
            </p>
          )}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thank you for your business!"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms">Terms</Label>
            <Textarea
              id="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Payment due within 30 days"
              rows={2}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Invoice"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
