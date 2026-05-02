import { createClient } from "@/lib/supabase/server";
import { renderToStream } from "@react-pdf/renderer";
import { TemplateWhiteCaps } from "@/components/pdf/templates/template-white-caps";
import { TemplateCreamSerif } from "@/components/pdf/templates/template-cream-serif";
import { registerFonts } from "@/lib/pdf/fonts";
import { notFound } from "next/navigation";
import React from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceRes, itemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)`)
      .eq("id", id)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", id)
      .order("sort_order"),
  ]);

  if (!invoiceRes.data) return notFound();

  registerFonts();

  const invoice = {
    ...invoiceRes.data,
    items: itemsRes.data ?? [],
  };

  const Template = invoice.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(React.createElement(Template, { invoice }) as any);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.invoice_number}.pdf"`,
    },
  });
}
