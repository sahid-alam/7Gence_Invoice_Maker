import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import type { TaxType, CurrencyCode } from "@/types/app.types";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [invoiceRes, itemsRes, profilesRes, clientsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", id)
      .eq("owner_id", user.id)
      .order("sort_order"),
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

  if (!invoiceRes.data) notFound();
  const invoice = invoiceRes.data;

  if (invoice.status !== "draft") {
    redirect(`/invoices/${id}`);
  }

  const profiles = profilesRes.data ?? [];
  if (profiles.length === 0) redirect("/profiles/new");

  const items = (itemsRes.data ?? []).map((item) => ({
    id: crypto.randomUUID(),
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const initialValues = {
    invoiceId: id,
    profileId: invoice.business_profile_id,
    currency: invoice.currency as CurrencyCode,
    templateId: invoice.template_id ?? "white-caps",
    clientId: invoice.client_id ?? undefined,
    clientName: invoice.client_name ?? "",
    clientCompany: invoice.client_company ?? "",
    clientEmail: invoice.client_email ?? "",
    clientAddress: invoice.client_address ?? "",
    clientGstin: invoice.client_gstin ?? "",
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date ?? "",
    items: items.length > 0 ? items : [{ id: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 }],
    taxType: (invoice.tax_type ?? "none") as TaxType,
    taxRate: Math.round(Number(invoice.tax_rate ?? 0) * 100),
    discountPercent: Math.round(Number(invoice.discount_percent ?? 0) * 100 * 100) / 100,
    paymentMethodId: invoice.payment_method_id ?? "__none__",
    notes: invoice.notes ?? "",
    terms: invoice.terms ?? "",
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Edit Invoice</h2>
        <p className="text-muted-foreground font-mono text-sm">{invoice.invoice_number}</p>
      </div>
      <InvoiceForm
        profiles={profiles}
        clients={clientsRes.data ?? []}
        initialValues={initialValues}
      />
    </div>
  );
}
