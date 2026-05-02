import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default async function NewInvoicePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profilesRes, clientsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, default_currency, default_template_id, state")
      .order("is_default", { ascending: false })
      .order("display_name"),
    supabase
      .from("clients")
      .select("id, name, company_name, email, address_line1, city, country, gstin")
      .order("name"),
  ]);

  const profiles = profilesRes.data ?? [];

  if (profiles.length === 0) {
    redirect("/profiles/new");
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">New Invoice</h2>
        <p className="text-muted-foreground">Create a professional invoice</p>
      </div>
      <InvoiceForm profiles={profiles} clients={clientsRes.data ?? []} />
    </div>
  );
}
