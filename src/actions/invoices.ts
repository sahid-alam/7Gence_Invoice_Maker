"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { logInvoiceEvent } from "@/lib/invoice-events";
import { calculateTax } from "@/lib/tax-calculator";
import type { TaxType } from "@/types/app.types";

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateInvoiceInput {
  business_profile_id: string;
  client_id?: string;
  client_name: string;
  client_company?: string;
  client_email?: string;
  client_address?: string;
  client_gstin?: string;
  issue_date: string;
  due_date?: string;
  currency: string;
  tax_type: TaxType;
  tax_rate: number;
  discount_percent: number;
  payment_method_id?: string;
  template_id: string;
  notes?: string;
  terms?: string;
  items: InvoiceItemInput[];
}

export async function createInvoice(input: CreateInvoiceInput) {
  const member = await requireMember();
  const supabase = await createClient();

  // Get profile snapshot for GST fields
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("gstin, state, default_template_id")
    .eq("id", input.business_profile_id)
    .eq("org_id", member.orgId)
    .single();

  // Get payment method snapshot
  let paymentSnapshot = null;
  if (input.payment_method_id) {
    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", input.payment_method_id)
      .eq("org_id", member.orgId)
      .single();
    if (pm) paymentSnapshot = pm;
  }

  // Validate numeric inputs
  if (!Number.isFinite(input.tax_rate) || input.tax_rate < 0 || input.tax_rate > 100) throw new Error("Invalid tax rate");
  if (!Number.isFinite(input.discount_percent) || input.discount_percent < 0 || input.discount_percent > 100) throw new Error("Invalid discount");
  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Invalid quantity");
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error("Invalid unit price");
  }

  // Calculate totals
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const tax = calculateTax({
    subtotal,
    tax_type: input.tax_type,
    tax_rate: input.tax_rate,
    discount_percent: input.discount_percent,
  });

  // Get atomic invoice number
  const { data: numberResult, error: numError } = await supabase
    .rpc("next_invoice_number", { profile_id: input.business_profile_id });

  if (numError) throw new Error(numError.message);

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      owner_id: member.id,
      org_id: member.orgId,
      business_profile_id: input.business_profile_id,
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_company: input.client_company || null,
      client_email: input.client_email || null,
      client_address: input.client_address || null,
      client_gstin: input.client_gstin || null,
      invoice_number: numberResult,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      currency: input.currency,
      subtotal: tax.subtotal,
      tax_type: input.tax_type,
      tax_rate: input.tax_rate / 100,
      cgst_rate: input.tax_type === "cgst_sgst" ? input.tax_rate / 2 / 100 : null,
      sgst_rate: input.tax_type === "cgst_sgst" ? input.tax_rate / 2 / 100 : null,
      igst_rate: input.tax_type === "igst" ? input.tax_rate / 100 : null,
      tax_amount: tax.tax_amount,
      discount_percent: input.discount_percent / 100,
      discount_amount: tax.discount_amount,
      total: tax.total,
      status: "draft",
      payment_method_id: input.payment_method_id || null,
      payment_method_snapshot: paymentSnapshot,
      template_id: input.template_id || profile?.default_template_id || "white-caps",
      sender_gstin: profile?.gstin || null,
      sender_state: profile?.state || null,
      notes: input.notes || null,
      terms: input.terms || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert line items
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      input.items.map((item, idx) => ({
        invoice_id: invoice.id,
        owner_id: member.id,
      org_id: member.orgId,
        sort_order: idx,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  await logInvoiceEvent(invoice.id, "created", { invoice_number: numberResult, total: tax.total, currency: input.currency });

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${invoice.id}?saved=Invoice+created`);
}

export async function updateInvoiceStatus(
  id: string,
  status: "sent" | "void",
) {
  const member = await requireMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);

  await logInvoiceEvent(id, status === "sent" ? "sent" : "voided");

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}


/**
 * Retract a sent invoice back to draft so it can be corrected and re-sent.
 *
 * Preferred over editing in place: "sent" should mean the client holds exactly
 * this document, and preferred over voiding, which permanently burns an invoice
 * number that GST requires to stay sequential.
 *
 * Refused once any payment is applied. At that point the invoice is reconciled
 * against a bank credit (and for exports, an FIRC), so the correct instrument is
 * a credit note, not a retroactive edit.
 */
export async function unsendInvoice(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, invoice_number")
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();
  if (!invoice) throw new Error("Invoice not found");

  if (invoice.status !== "sent") {
    throw new Error(
      invoice.status === "paid" || invoice.status === "partial"
        ? "This invoice has payments against it — issue a credit note instead of editing it"
        : `Only a sent invoice can be moved back to draft (this one is ${invoice.status})`
    );
  }

  // Belt and braces: status could be 'sent' while links exist if paid_amount ever
  // drifts. The money check is the one that actually matters, so check it directly.
  const { count } = await supabase
    .from("payment_invoice_links")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", id);
  if ((count ?? 0) > 0) {
    throw new Error("This invoice has payments against it — issue a credit note instead");
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", member.orgId);
  if (error) throw new Error(error.message);

  await logInvoiceEvent(id, "unsent", { invoice_number: invoice.invoice_number });

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function updateInvoice(id: string, input: CreateInvoiceInput) {
  const member = await requireMember();
  const supabase = await createClient();

  // The edit route is draft-only. The menu already hides Edit for other statuses,
  // but nothing stopped a direct /invoices/<id>/edit URL from rewriting a paid
  // invoice — which would desync paid_amount from total and corrupt the status.
  const { data: current } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();
  if (!current) throw new Error("Invoice not found");
  if (current.status !== "draft") {
    throw new Error(
      current.status === "sent"
        ? "Move this invoice back to draft before editing it"
        : `A ${current.status} invoice cannot be edited`
    );
  }

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("gstin, state, default_template_id")
    .eq("id", input.business_profile_id)
    .eq("org_id", member.orgId)
    .single();

  let paymentSnapshot = null;
  if (input.payment_method_id) {
    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", input.payment_method_id)
      .eq("org_id", member.orgId)
      .single();
    if (pm) paymentSnapshot = pm;
  }

  if (!Number.isFinite(input.tax_rate) || input.tax_rate < 0 || input.tax_rate > 100) throw new Error("Invalid tax rate");
  if (!Number.isFinite(input.discount_percent) || input.discount_percent < 0 || input.discount_percent > 100) throw new Error("Invalid discount");
  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Invalid quantity");
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error("Invalid unit price");
  }

  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const tax = calculateTax({
    subtotal,
    tax_type: input.tax_type,
    tax_rate: input.tax_rate,
    discount_percent: input.discount_percent,
  });

  const { error } = await supabase
    .from("invoices")
    .update({
      business_profile_id: input.business_profile_id,
      client_id: input.client_id || null,
      client_name: input.client_name,
      client_company: input.client_company || null,
      client_email: input.client_email || null,
      client_address: input.client_address || null,
      client_gstin: input.client_gstin || null,
      issue_date: input.issue_date,
      due_date: input.due_date || null,
      currency: input.currency,
      subtotal: tax.subtotal,
      tax_type: input.tax_type,
      tax_rate: input.tax_rate / 100,
      cgst_rate: input.tax_type === "cgst_sgst" ? input.tax_rate / 2 / 100 : null,
      sgst_rate: input.tax_type === "cgst_sgst" ? input.tax_rate / 2 / 100 : null,
      igst_rate: input.tax_type === "igst" ? input.tax_rate / 100 : null,
      tax_amount: tax.tax_amount,
      discount_percent: input.discount_percent / 100,
      discount_amount: tax.discount_amount,
      total: tax.total,
      payment_method_id: input.payment_method_id || null,
      payment_method_snapshot: paymentSnapshot,
      template_id: input.template_id || profile?.default_template_id || "white-caps",
      sender_gstin: profile?.gstin || null,
      sender_state: profile?.state || null,
      notes: input.notes || null,
      terms: input.terms || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", member.orgId)
    .eq("status", "draft");

  if (error) throw new Error(error.message);

  // Replace line items
  await supabase.from("invoice_items").delete().eq("invoice_id", id).eq("org_id", member.orgId);
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      input.items.map((item, idx) => ({
        invoice_id: id,
        owner_id: member.id,
      org_id: member.orgId,
        sort_order: idx,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  await logInvoiceEvent(id, "edited", { total: tax.total, currency: input.currency });

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${id}?saved=Changes+saved`);
}

/**
 * Delete a draft or a voided invoice.
 *
 * Both are documents with no financial effect: a draft was never issued, and a void
 * has been cancelled. Anything with money against it goes through
 * `deleteInvoiceForce`, which asks for a password.
 *
 * This used to filter `.eq("status","draft")` inside the delete itself. On any other
 * status that matched zero rows and returned no error — so the action redirected
 * saying "Invoice deleted" having deleted nothing. Check first, and say what's wrong.
 */
export async function deleteInvoice(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, invoice_number")
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();
  if (!invoice) throw new Error("Invoice not found");

  if (invoice.status !== "draft" && invoice.status !== "void") {
    throw new Error(
      `${invoice.invoice_number} is ${invoice.status}. Void it first, or use Delete Invoice if it has payments against it.`
    );
  }

  // A void invoice can still carry payment links if it was voided after a part
  // payment. Deleting it would take the links with it and silently change earnings.
  const { count } = await supabase
    .from("payment_invoice_links")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", id);
  if ((count ?? 0) > 0) {
    throw new Error(
      `${invoice.invoice_number} has payments recorded against it — remove those from the Payments page first.`
    );
  }

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect("/invoices?saved=Invoice+deleted");
}

export async function deleteInvoiceForce(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/receipts");
}
