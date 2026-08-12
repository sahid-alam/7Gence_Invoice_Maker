import { createClient } from "@/lib/supabase/server";
import { getMember } from "@/lib/auth";
import { renderToStream } from "@react-pdf/renderer";
import { TemplateWhiteCaps } from "@/components/pdf/templates/template-white-caps";
import { TemplateCreamSerif } from "@/components/pdf/templates/template-cream-serif";
import type { PaymentMethodSnapshot } from "@/types/app.types";
import { registerFonts } from "@/lib/pdf/fonts";
import { notFound } from "next/navigation";
import React from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const member = await getMember();
  if (!member) return new Response("Unauthorized", { status: 401 });

  const { data: receipt } = await supabase
    .from("receipts")
    .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url), invoices(invoice_number)`)
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();

  if (!receipt) return notFound();

  registerFonts();

  const receiptData = {
    invoice_number: receipt.receipt_number,
    issue_date: receipt.payment_date,
    due_date: null,
    currency: receipt.currency,
    subtotal: receipt.amount,
    tax_type: "none",
    tax_amount: 0,
    cgst_rate: null,
    sgst_rate: null,
    tax_rate: null,
    discount_amount: 0,
    total: receipt.amount,
    client_name: receipt.client_name,
    client_company: receipt.client_company,
    client_address: receipt.client_address,
    client_gstin: null,
    sender_gstin: null,
    notes: receipt.notes,
    linked_invoice_number: (receipt.invoices as { invoice_number: string } | null)?.invoice_number ?? null,
    payment_method_snapshot: receipt.payment_method_snapshot as PaymentMethodSnapshot | null,
    business_profiles: receipt.business_profiles,
    items: [],
  };

  const Template = receipt.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(React.createElement(Template, { invoice: receiptData, documentType: "receipt" }) as any);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${receipt.receipt_number}.pdf"`,
    },
  });
}
