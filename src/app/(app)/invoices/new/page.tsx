import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";

export default async function NewInvoicePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const [profilesRes, clientsRes] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("id, display_name, default_currency, default_template_id, state")
      .eq("org_id", member.orgId)
      .order("is_default", { ascending: false })
      .order("display_name"),
    supabase
      .from("clients")
      .select("id, name, company_name, email, address_line1, city, country, gstin")
      .eq("org_id", member.orgId)
      .order("name"),
  ]);

  // The form takes the first profile as its initial choice, so precedence is
  // expressed by ordering: your own default first, then the org-wide default
  // (already applied by the query), then alphabetical.
  const profiles = [...(profilesRes.data ?? [])].sort(
    (a, b) =>
      Number(b.id === member.defaultProfileId) - Number(a.id === member.defaultProfileId)
  );

  if (profiles.length === 0) {
    redirect("/profiles/new");
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">New Invoice</h2>
        <p className="text-muted-foreground">Create a professional invoice</p>
      </div>
      <NewInvoiceForm profiles={profiles} clients={clientsRes.data ?? []} />
    </div>
  );
}
