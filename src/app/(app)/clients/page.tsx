import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { DeleteClientButton } from "@/components/clients/delete-client-button";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, company_name, email, city, country")
    .eq("owner_id", user!.id)
    .order("name");

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">Your client address book</p>
        </div>
        <Button asChild>
          <Link href="/clients/new">
            <Plus size={16} className="mr-2" />
            New Client
          </Link>
        </Button>
      </div>

      {(clients?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Users size={32} className="mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No clients yet</p>
          <p className="text-sm text-muted-foreground mt-1">Save client details to reuse them in invoices</p>
          <Button asChild className="mt-4">
            <Link href="/clients/new">Add first client</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients?.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.company_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteClientButton clientId={c.id} clientName={c.name} showLabel={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
