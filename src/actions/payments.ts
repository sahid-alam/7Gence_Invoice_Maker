"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { logInvoiceEvents } from "@/lib/invoice-events";

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
  const member = await requireMember();
  const supabase = await createClient();

  if (input.splits.length === 0) throw new Error("At least one invoice split is required");

  const { data: invoices, error: invError } = await supabase
    .from("invoices")
    .select("id, status, total, paid_amount, currency, client_name, client_company, client_address, payment_method_snapshot, template_id, business_profile_id")
    .in("id", input.splits.map((s) => s.invoice_id))
    .eq("org_id", member.orgId);

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

  // Settlement is a pair or nothing. An amount without a currency would be
  // excluded from every earnings total while still looking settled in the ledger.
  const hasSettlement = input.received_amount != null || !!input.received_currency?.trim();
  if (hasSettlement) {
    if (input.received_amount == null || !Number.isFinite(input.received_amount) || input.received_amount <= 0) {
      throw new Error("Amount credited to bank must be a positive number");
    }
    if (!input.received_currency?.trim()) {
      throw new Error("Currency for the credited amount is required");
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
      owner_id: member.id,
      org_id: member.orgId,
      business_profile_id: input.business_profile_id,
      payer_name: input.payer_name,
      total_amount: input.total_amount,
      currency: input.currency,
      received_amount: hasSettlement ? input.received_amount : null,
      received_currency: hasSettlement ? input.received_currency!.trim().toUpperCase() : null,
      payment_date: input.payment_date,
      payment_mode: input.payment_mode,
      reference: input.reference || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (payError) throw new Error(payError.message);

  // org_id is required here even though this table has no owner_id. Its original
  // policy derived access by joining to the parent payments/invoices rows, so there
  // was never an ownership column on the insert — which is exactly why the move to
  // org scoping missed it. The org policy's WITH CHECK rejects the row without it.
  const { error: linksError } = await supabase.from("payment_invoice_links").insert(
    input.splits.map((s) => ({
      org_id: member.orgId,
      payment_id: payment.id,
      invoice_id: s.invoice_id,
      amount_applied: s.amount_applied,
    }))
  );
  if (linksError) {
    // The payment row is already committed — supabase-js has no multi-statement
    // transaction, so a failure here would leave a payment attached to no invoice.
    // Those orphans still count toward earnings while reconciling against nothing,
    // and each retry adds another. Undo our own insert before surfacing the error.
    await supabase.from("payments").delete().eq("id", payment.id).eq("org_id", member.orgId);
    throw new Error(linksError.message);
  }

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
      .eq("org_id", member.orgId);

    if (isFullyPaid) {
      const { data: receiptNum } = await supabase.rpc("next_receipt_number", {
        profile_id: inv.business_profile_id,
      });
      await supabase.from("receipts").insert({
        owner_id: member.id,
        org_id: member.orgId,
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

  await logInvoiceEvents(input.splits.map((s) => s.invoice_id), "payment_recorded", {
    total_amount: input.total_amount,
    currency: input.currency,
    payment_date: input.payment_date,
    payment_mode: input.payment_mode,
  });

  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/receipts");
}

export async function deletePayment(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();
  if (!payment) throw new Error("Payment not found");

  const { data: links } = await supabase
    .from("payment_invoice_links")
    .select("invoice_id")
    .eq("payment_id", id);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);

  const { error } = await supabase.from("payments").delete().eq("id", id).eq("org_id", member.orgId);
  if (error) throw new Error(error.message);

  await logInvoiceEvents(invoiceIds, "payment_deleted");

  for (const invoiceId of invoiceIds) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, total, status, business_profile_id")
      .eq("id", invoiceId)
      .eq("org_id", member.orgId)
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
      .eq("org_id", member.orgId);

    if (wasFullyPaid && !isNowFullyPaid) {
      await supabase
        .from("receipts")
        .delete()
        .eq("invoice_id", invoiceId)
        .eq("org_id", member.orgId);
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
  received_currency: string,
  /** Date the money reached the bank. Drives which financial year it books to. */
  received_date?: string
) {
  const member = await requireMember();
  const supabase = await createClient();

  if (!Number.isFinite(received_amount) || received_amount <= 0) {
    throw new Error("Amount credited to bank must be a positive number");
  }
  if (!received_currency.trim()) throw new Error("Currency for the credited amount is required");

  if (received_date && !/^\d{4}-\d{2}-\d{2}$/.test(received_date)) {
    throw new Error("Date credited must be a valid date");
  }

  const { error } = await supabase
    .from("payments")
    .update({
      received_amount,
      received_currency: received_currency.trim().toUpperCase(),
      received_date: received_date || null,
    })
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

/**
 * Return a payment to "not settled".
 *
 * Needed because a settlement entered in error cannot otherwise be undone —
 * updatePaymentSettlement requires a positive amount, so it can only overwrite a
 * wrong number with another number, never remove it. Clearing both columns puts
 * the payment back in the pending bucket so the earnings total stops counting it.
 */
export async function clearPaymentSettlement(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  // Both to NULL together — the constraint in migration 0013 allows null/null.
  const { error } = await supabase
    .from("payments")
    .update({ received_amount: null, received_currency: null, received_date: null })
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);

  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function getOutstandingInvoices(profileId: string, currency: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_name, total, paid_amount, currency")
    .eq("org_id", member.orgId)
    .eq("business_profile_id", profileId)
    .eq("currency", currency)
    .in("status", ["sent", "partial"])
    .order("issue_date", { ascending: false });

  return data ?? [];
}
