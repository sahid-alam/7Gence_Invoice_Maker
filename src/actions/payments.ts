"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface RecordPaymentInput {
  business_profile_id: string;
  payer_name: string;
  total_amount: number;
  currency: string;
  received_amount?: number;
  received_currency?: string;
  payment_date: string;
  payment_mode: string;
  reference?: string;
  notes?: string;
  splits: { invoice_id: string; amount_applied: number }[];
}

export async function recordPayment(input: RecordPaymentInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (input.splits.length === 0) throw new Error("At least one invoice split is required");

  const { data: invoices, error: invError } = await supabase
    .from("invoices")
    .select("id, status, total, paid_amount, currency, client_name, client_company, client_address, payment_method_snapshot, template_id, business_profile_id")
    .in("id", input.splits.map((s) => s.invoice_id))
    .eq("owner_id", user.id);

  if (invError) throw new Error(invError.message);
  if (!invoices || invoices.length !== input.splits.length) throw new Error("One or more invoices not found");

  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "partial") {
      throw new Error(`Invoice is not in a payable status`);
    }
    if (inv.currency !== input.currency) {
      throw new Error(`Currency mismatch: all invoices must use ${input.currency}`);
    }
  }

  // Integer arithmetic to avoid float drift
  const totalCents = Math.round(input.total_amount * 10000);
  const splitSumCents = input.splits.reduce((sum, s) => sum + Math.round(s.amount_applied * 10000), 0);
  if (splitSumCents !== totalCents) throw new Error("Split amounts must sum to total payment amount");

  for (const split of input.splits) {
    const inv = invoices.find((i) => i.id === split.invoice_id)!;
    const remainingCents =
      Math.round(inv.total * 10000) - Math.round((inv.paid_amount ?? 0) * 10000);
    const appliedCents = Math.round(split.amount_applied * 10000);
    if (appliedCents <= 0) throw new Error("Split amount must be positive");
    if (appliedCents > remainingCents) throw new Error("Payment exceeds remaining balance on an invoice");
  }

  const { data: payment, error: payError } = await supabase
    .from("payments")
    .insert({
      owner_id: user.id,
      business_profile_id: input.business_profile_id,
      payer_name: input.payer_name,
      total_amount: input.total_amount,
      currency: input.currency,
      received_amount: input.received_amount || null,
      received_currency: input.received_currency || null,
      payment_date: input.payment_date,
      payment_mode: input.payment_mode,
      reference: input.reference || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (payError) throw new Error(payError.message);

  const { error: linksError } = await supabase.from("payment_invoice_links").insert(
    input.splits.map((s) => ({
      payment_id: payment.id,
      invoice_id: s.invoice_id,
      amount_applied: s.amount_applied,
    }))
  );
  if (linksError) throw new Error(linksError.message);

  for (const inv of invoices) {
    const { data: allLinks } = await supabase
      .from("payment_invoice_links")
      .select("amount_applied")
      .eq("invoice_id", inv.id);

    const newPaidAmount = (allLinks ?? []).reduce((sum, l) => sum + Number(l.amount_applied), 0);
    const invTotalCents = Math.round(inv.total * 10000);
    const newPaidCents = Math.round(newPaidAmount * 10000);
    const isFullyPaid = newPaidCents >= invTotalCents;
    const newStatus = isFullyPaid ? "paid" : "partial";

    const updateData: Record<string, unknown> = {
      paid_amount: newPaidAmount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (isFullyPaid) updateData.paid_at = new Date().toISOString();

    await supabase
      .from("invoices")
      .update(updateData)
      .eq("id", inv.id)
      .eq("owner_id", user.id);

    if (isFullyPaid) {
      const { data: receiptNum } = await supabase.rpc("next_receipt_number", {
        profile_id: inv.business_profile_id,
      });
      await supabase.from("receipts").insert({
        owner_id: user.id,
        invoice_id: inv.id,
        business_profile_id: inv.business_profile_id,
        receipt_number: receiptNum,
        client_name: inv.client_name,
        client_company: inv.client_company,
        client_address: inv.client_address,
        amount: inv.total,
        currency: inv.currency,
        payment_method_snapshot: inv.payment_method_snapshot,
        payment_date: input.payment_date,
        template_id: inv.template_id,
      });
    }

    revalidatePath(`/invoices/${inv.id}`);
  }

  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/receipts");
}

export async function deletePayment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (!payment) throw new Error("Payment not found");

  const { data: links } = await supabase
    .from("payment_invoice_links")
    .select("invoice_id")
    .eq("payment_id", id);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);

  const { error } = await supabase.from("payments").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw new Error(error.message);

  for (const invoiceId of invoiceIds) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, total, status, business_profile_id")
      .eq("id", invoiceId)
      .eq("owner_id", user.id)
      .single();
    if (!inv) continue;

    const { data: remainingLinks } = await supabase
      .from("payment_invoice_links")
      .select("amount_applied")
      .eq("invoice_id", invoiceId);

    const newPaidAmount = (remainingLinks ?? []).reduce((sum, l) => sum + Number(l.amount_applied), 0);
    const invTotalCents = Math.round(inv.total * 10000);
    const newPaidCents = Math.round(newPaidAmount * 10000);
    const isNowFullyPaid = newPaidCents >= invTotalCents;
    const wasFullyPaid = inv.status === "paid";
    const newStatus = newPaidCents === 0 ? "sent" : isNowFullyPaid ? "paid" : "partial";

    await supabase
      .from("invoices")
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(!isNowFullyPaid && { paid_at: null }),
      })
      .eq("id", invoiceId)
      .eq("owner_id", user.id);

    if (wasFullyPaid && !isNowFullyPaid) {
      await supabase
        .from("receipts")
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("owner_id", user.id);
    }

    revalidatePath(`/invoices/${invoiceId}`);
  }

  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/receipts");
}

export async function updatePaymentSettlement(
  id: string,
  received_amount: number,
  received_currency: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (received_amount <= 0) throw new Error("Received amount must be positive");
  if (!received_currency.trim()) throw new Error("Received currency is required");

  const { error } = await supabase
    .from("payments")
    .update({ received_amount, received_currency: received_currency.trim().toUpperCase() })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function getOutstandingInvoices(profileId: string, currency: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, paid_amount, currency")
    .eq("owner_id", user.id)
    .eq("business_profile_id", profileId)
    .eq("currency", currency)
    .in("status", ["sent", "partial"])
    .order("issue_date", { ascending: false });

  return data ?? [];
}
