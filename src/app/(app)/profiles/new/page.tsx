import { createProfile } from "@/actions/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { INDIAN_STATES } from "@/types/app.types";
import Link from "next/link";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "USDT"];
const TEMPLATES = [
  { id: "white-caps", label: "White – Classic Caps" },
  { id: "cream-serif", label: "Cream – Modern Serif" },
];

export default function NewProfilePage() {
  return (
    <div className="p-4 sm:p-8 max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">New Business Profile</h2>
        <p className="text-muted-foreground">This represents you (or a team member) as the invoice sender</p>
      </div>

      <form action={createProfile} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="display_name">Display Name *</Label>
            <Input id="display_name" name="display_name" placeholder="Sahid Alam" required />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="legal_name">Legal / Company Name</Label>
            <Input id="legal_name" name="legal_name" placeholder="7Gence Technologies" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="sahid@7gence.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="+91 9000000000" />
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-semibold">Address</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="address_line1">Street Address</Label>
              <Input id="address_line1" name="address_line1" placeholder="123 MG Road" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" placeholder="Bengaluru" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <select name="state" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" name="country" defaultValue="IN" placeholder="IN" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input id="postal_code" name="postal_code" placeholder="560001" />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-semibold">Tax Details (India)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input id="gstin" name="gstin" placeholder="29AABCU9603R1ZX" maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pan">PAN</Label>
              <Input id="pan" name="pan" placeholder="AABCU9603R" maxLength={10} />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-semibold">Invoice Defaults</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
              <Input id="invoice_prefix" name="invoice_prefix" placeholder="7GS" defaultValue="7GS" maxLength={6} />
              <p className="text-xs text-muted-foreground">e.g. 7GS → 7GS-2026-001</p>
            </div>
            <div className="space-y-2">
              <Label>Default Currency</Label>
              <select name="default_currency" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Default Template</Label>
              <select name="default_template_id" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit">Create Profile</Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/profiles">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
