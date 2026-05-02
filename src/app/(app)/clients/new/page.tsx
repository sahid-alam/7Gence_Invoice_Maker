import { createClient_action } from "@/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default function NewClientPage() {
  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">New Client</h2>
        <p className="text-muted-foreground">Save a client to reuse in invoices</p>
      </div>
      <form action={createClient_action} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Contact Name *</Label>
            <Input name="name" placeholder="John Smith" required />
          </div>
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input name="company_name" placeholder="Acme Corp" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="john@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input name="phone" placeholder="+1 555 000 0000" />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Street Address</Label>
            <Input name="address_line1" placeholder="123 Main Street" />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input name="city" placeholder="Dubai" />
          </div>
          <div className="space-y-2">
            <Label>State / Region</Label>
            <Input name="state" placeholder="Dubai" />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input name="country" placeholder="UAE" />
          </div>
          <div className="space-y-2">
            <Label>Postal Code</Label>
            <Input name="postal_code" placeholder="00000" />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>GSTIN (if Indian client)</Label>
          <Input name="gstin" placeholder="29AABCU9603R1ZX" maxLength={15} />
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea name="notes" placeholder="Internal notes about this client" rows={2} />
        </div>

        <div className="flex gap-3">
          <Button type="submit">Save Client</Button>
          <Button variant="outline" asChild>
            <Link href="/clients">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
