"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get profile snapshot for GST fields
  const { data: profile } = await supabase
    .from("business_profiles")
    .select("gstin, state, default_template_id")
    .eq("id", input.business_profile_id)
    .eq("owner_id", user.id)
    .single();

  // Get payment method snapshot
  let paymentSnapshot = null;
  if (input.payment_method_id) {
    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", input.payment_method_id)
      .eq("owner_id", user.id)
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
      owner_id: user.id,
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
        owner_id: user.id,
        sort_order: idx,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${invoice.id}?saved=Invoice+created`);
}

export async function updateInvoiceStatus(
  id: string,
  status: "sent" | "void",
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("invoices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}


export async function updateInvoice(id: string, input: CreateInvoiceInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("gstin, state, default_template_id")
    .eq("id", input.business_profile_id)
    .eq("owner_id", user.id)
    .single();

  let paymentSnapshot = null;
  if (input.payment_method_id) {
    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", input.payment_method_id)
      .eq("owner_id", user.id)
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
    .eq("owner_id", user.id)
    .eq("status", "draft");

  if (error) throw new Error(error.message);

  // Replace line items
  await supabase.from("invoice_items").delete().eq("invoice_id", id).eq("owner_id", user.id);
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      input.items.map((item, idx) => ({
        invoice_id: id,
        owner_id: user.id,
        sort_order: idx,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${id}?saved=Changes+saved`);
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("status", "draft");

  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect("/invoices?saved=Invoice+deleted");
}

export async function deleteInvoiceForce(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/receipts");
}
