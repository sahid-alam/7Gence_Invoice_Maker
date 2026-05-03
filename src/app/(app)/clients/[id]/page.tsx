import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { updateClient } from "@/actions/clients";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { formatCurrency } from "@/lib/currency";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .eq("owner_id", user!.id)
    .single();

  if (!client) notFound();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, currency, issue_date, due_date")
    .eq("client_id", params.id)
    .eq("owner_id", user!.id)
    .order("issue_date", { ascending: false })
    .limit(10);

  const updateWithId = updateClient.bind(null, client.id);

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft size={16} className="mr-1" />
            Clients
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{client.name}</h2>
          {client.company_name && (
            <p className="text-muted-foreground">{client.company_name}</p>
          )}
        </div>
        <DeleteClientButton clientId={client.id} clientName={client.name} />
      </div>

      <Separator />

      <form action={updateWithId} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" defaultValue={client.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company_name">Company</Label>
            <Input id="company_name" name="company_name" defaultValue={client.company_name ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={client.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={client.phone ?? ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address_line1">Address Line 1</Label>
          <Input id="address_line1" name="address_line1" defaultValue={client.address_line1 ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_line2">Address Line 2</Label>
          <Input id="address_line2" name="address_line2" defaultValue={client.address_line2 ?? ""} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={client.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" defaultValue={client.state ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" defaultValue={client.country ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postal Code</Label>
            <Input id="postal_code" name="postal_code" defaultValue={client.postal_code ?? ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input id="gstin" name="gstin" defaultValue={client.gstin ?? ""} placeholder="22AAAAA0000A1Z5" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={client.notes ?? ""} rows={3} />
        </div>

        <Button type="submit">Save changes</Button>
      </form>

      {(invoices?.length ?? 0) > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="font-semibold">Invoice history</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices?.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(inv.issue_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          inv.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          inv.status === "sent" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                          inv.status === "void" ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" :
                          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
