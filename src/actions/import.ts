"use server";

import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { logInvoiceEvent } from "@/lib/invoice-events";
import {
  extractByPattern, redactBankDetails, review, type ExtractionResult,
} from "@/lib/invoice-extract";
import { extractWithGroq } from "@/lib/groq-extract";
import { calculateTax } from "@/lib/tax-calculator";
import type { TaxType } from "@/types/app.types";

/** Fields without which a draft isn't worth pre-filling — triggers the AI fallback. */
const CRITICAL = ["total", "client", "date"];

export interface ParsedUpload extends ExtractionResult {
  fileName: string;
  /** What the reviewer can check the form against. Never leaves the browser. */
  rawText: string;
  aiError?: string;
  /** Why the reviewer is looking at an emptier form than they expected. */
  note?: string;
}

/** Nothing found, but still a form to fill in. Never an error page. */
function emptyUpload(fileName: string, note: string, rawText = ""): ParsedUpload {
  const blank = review(
    {
      invoice_number: null, issue_date: null, due_date: null, client_name: null,
      client_address: null, currency: null, subtotal: null, tax_rate: null, tax_type: null,
      total: null, items: [],
    },
    "manual"
  );
  return { ...blank, fileName, rawText, note };
}

/**
 * Read an uploaded PDF into a draft for review. Saves nothing.
 *
 * Pattern matching first — free, instant, and exact. The model is only asked when
 * that leaves something critical empty, which is what makes template drift a
 * degradation rather than a breakage.
 *
 * Every path returns a form. A scan with no text layer, a corrupt file, a model that
 * is down — none of them are dead ends, because typing an invoice in by hand is
 * always available and an error page would take even that away.
 *
 * `mode: "ai"` forces the model even when pattern matching succeeded, for the case
 * where it succeeded but got it wrong.
 */
export async function parseInvoicePdf(
  formData: FormData,
  mode: "auto" | "ai" = "auto"
): Promise<ParsedUpload> {
  await requireMember();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file received");
  return readOne(file, mode);
}

/**
 * Read a whole folder of old invoices in one pass.
 *
 * Sequential rather than concurrent: the slow step is the AI fallback, and firing
 * twenty of those at once is the reliable way to get rate-limited into a batch of
 * failures. One at a time is slower and finishes.
 *
 * Never throws for a single bad file — a batch of thirty must not be lost because
 * the fourth one is a scan. Each file comes back with its own state.
 */
export async function parseInvoicePdfs(formData: FormData): Promise<ParsedUpload[]> {
  await requireMember();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new Error("No files received");
  if (files.length > 40) throw new Error("That's over 40 files — import them in smaller batches");

  const out: ParsedUpload[] = [];
  for (const file of files) {
    try {
      out.push(await readOne(file, "auto"));
    } catch (err) {
      out.push(
        emptyUpload(file.name, err instanceof Error ? err.message : "Couldn't read this file")
      );
    }
  }
  return out;
}

async function readOne(file: File, mode: "auto" | "ai"): Promise<ParsedUpload> {
  if (file.size > 10 * 1024 * 1024) {
    return emptyUpload(file.name, "That file is over 10MB, so it wasn't read.");
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  let rawText = "";
  try {
    const pdf = await getDocumentProxy(buf);
    rawText = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return emptyUpload(
      file.name,
      "Couldn't open that file as a PDF. Enter the invoice below by hand, or re-export it and try again."
    );
  }

  if (!rawText.trim()) {
    return emptyUpload(
      file.name,
      "That PDF has no text layer — it's almost certainly a scan or an image. Nothing to read, so enter it below by hand."
    );
  }

  const byPattern = review(extractByPattern(rawText), "pattern");
  const needsAI = mode === "ai" || CRITICAL.some((f) => byPattern.missing.includes(f));

  if (!needsAI) return { ...byPattern, fileName: file.name, rawText };

  // Bank details are stripped before anything leaves the machine — an imported
  // invoice's payment block comes from the sender profile, so they serve no purpose
  // here and have no business reaching a third party.
  try {
    const ai = review(await extractWithGroq(redactBankDetails(rawText)), "ai");
    // A model that found less than the pattern matcher is not an improvement. This
    // only applies to a forced re-read — on the automatic path the pattern result is
    // missing something critical by definition.
    if (mode === "ai" && ai.missing.length > byPattern.missing.length) {
      return {
        ...byPattern,
        fileName: file.name,
        rawText,
        note: "The AI read found less than pattern matching did, so the original reading was kept.",
      };
    }
    return { ...ai, fileName: file.name, rawText };
  } catch (err) {
    // Fall back to whatever pattern matching did find. A partly filled form still
    // beats an error page.
    return {
      ...byPattern,
      fileName: file.name,
      rawText,
      aiError: err instanceof Error ? err.message : "AI extraction failed",
    };
  }
}

/** What an imported invoice may be saved as. `void` has no meaning for an import. */
export type ImportStatus = "draft" | "sent" | "partial" | "paid";

export interface ImportInput {
  business_profile_id: string;
  invoice_number: string;
  issue_date: string;
  due_date?: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  currency: string;
  tax_type: TaxType;
  /** Percentage, e.g. 18 — converted to the decimal the column stores. */
  tax_rate: number;
  discount_percent: number;
  status: ImportStatus;
  /** Only read when status is `partial`. */
  paid_amount?: number;
  items: { description: string; quantity: number; unit_price: number }[];
  notes?: string;
}

/**
 * Save a reviewed import as a historical invoice.
 *
 * Keeps the original number rather than drawing one from the counter — these already
 * exist in the world and their numbers are what the client and the bank saw. The
 * unique index on (business_profile_id, invoice_number) is what stops a clash, and
 * the counter is nudged past the import only when the old number happens to share
 * this profile's own numbering pattern.
 *
 * No payment row is ever created, whatever the status. `paid_amount` records what the
 * client settled; the Earned figure counts rows in `payments`, which exist only for
 * money this app watched arrive. Conflating the two is what would corrupt Earned.
 */
export async function importInvoice(input: ImportInput) {
  const member = await requireMember();
  const supabase = await createClient();

  if (!input.invoice_number.trim()) throw new Error("Invoice number is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date)) throw new Error("Date must be YYYY-MM-DD");
  if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) {
    throw new Error("Due date must be YYYY-MM-DD");
  }
  if (input.due_date && input.due_date < input.issue_date) {
    throw new Error("The due date can't be before the issue date");
  }
  if (!input.client_name.trim()) throw new Error("Client name is required");
  if (!input.items.length) throw new Error("Add at least one line item");
  if (!Number.isFinite(input.tax_rate) || input.tax_rate < 0 || input.tax_rate > 100) {
    throw new Error("Tax rate must be between 0 and 100");
  }
  if (
    !Number.isFinite(input.discount_percent) ||
    input.discount_percent < 0 ||
    input.discount_percent > 100
  ) {
    throw new Error("Discount must be between 0 and 100");
  }

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("id, invoice_prefix, invoice_counter, gstin, state")
    .eq("id", input.business_profile_id)
    .eq("org_id", member.orgId)
    .single();
  if (!profile) throw new Error("Sender profile not found");

  // Same maths the invoice form uses, so an import and a hand-entered invoice with
  // the same figures produce byte-identical rows.
  const tax = calculateTax({
    subtotal: input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    tax_type: input.tax_type,
    tax_rate: input.tax_rate,
    discount_percent: input.discount_percent,
  });
  const total = Math.round(tax.total * 100) / 100;

  // Only `partial` carries an amount the reviewer chose; the others are implied by
  // the status, and letting them disagree is how paid_amount desyncs from total.
  let paid_amount = 0;
  if (input.status === "paid") paid_amount = total;
  else if (input.status === "partial") {
    const p = Math.round((input.paid_amount ?? 0) * 100) / 100;
    if (!(p > 0)) throw new Error("A partly paid invoice needs the amount already received");
    if (p >= total) throw new Error("That's the full amount — mark it paid instead");
    paid_amount = p;
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      owner_id: member.id,
      org_id: member.orgId,
      business_profile_id: input.business_profile_id,
      client_name: input.client_name.trim(),
      client_email: input.client_email?.trim() || null,
      client_address: input.client_address?.trim() || null,
      invoice_number: input.invoice_number.trim(),
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
      total,
      status: input.status,
      paid_amount,
      sender_gstin: profile.gstin || null,
      sender_state: profile.state || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Invoice ${input.invoice_number} already exists for this sender.`);
    }
    throw new Error(error.message);
  }

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
  if (itemsError) {
    // No transaction available, so undo the parent rather than leave an invoice
    // with no lines — the same compensating pattern recordPayment uses.
    await supabase.from("invoices").delete().eq("id", invoice.id).eq("org_id", member.orgId);
    throw new Error(itemsError.message);
  }

  // Only bump the counter when the imported number is this profile's own pattern,
  // e.g. 7GS-2026-011 while the counter sits at 9. Numbers in any other shape (7GKZ)
  // cannot collide with generated ones, so they leave the counter alone.
  const match = input.invoice_number.trim().match(
    new RegExp(`^${profile.invoice_prefix}-\\d{4}-(\\d+)$`, "i")
  );
  if (match) {
    const seq = Number(match[1]);
    if (seq > (profile.invoice_counter ?? 0)) {
      await supabase
        .from("business_profiles")
        .update({ invoice_counter: seq })
        .eq("id", profile.id)
        .eq("org_id", member.orgId);
    }
  }

  await logInvoiceEvent(invoice.id, "created", {
    invoice_number: input.invoice_number,
    total,
    currency: input.currency,
    status: input.status,
    imported: true,
  });

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  return { id: invoice.id, invoice_number: input.invoice_number };
}

export interface ImportOutcome {
  invoice_number: string;
  fileName?: string;
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Import a reviewed batch.
 *
 * Each invoice stands alone — one that clashes with an existing number, or whose
 * figures don't validate, must not roll back the twenty that saved fine. The caller
 * gets a row-by-row result and can fix and re-run just the failures.
 */
export async function importInvoices(
  inputs: (ImportInput & { fileName?: string })[]
): Promise<ImportOutcome[]> {
  await requireMember();

  const out: ImportOutcome[] = [];
  for (const input of inputs) {
    try {
      const res = await importInvoice(input);
      out.push({ ...res, fileName: input.fileName, ok: true });
    } catch (err) {
      out.push({
        invoice_number: input.invoice_number,
        fileName: input.fileName,
        ok: false,
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  }
  return out;
}
