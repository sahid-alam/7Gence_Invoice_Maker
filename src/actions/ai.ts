"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { composeInvoice } from "@/lib/ai/compose-invoice";
import { writeBrief } from "@/lib/ai/brief";
import { computeInsights } from "@/lib/insights";
import { suggestTaxType } from "@/lib/tax-calculator";

/**
 * Summarise what the books are saying, in a couple of sentences.
 *
 * The findings are recomputed here rather than accepted from the browser — a client
 * that can post arbitrary "findings" could talk the model into saying anything, and
 * this text sits above real figures.
 *
 * Client names are swapped for placeholders on the way out and restored on the way
 * back, so the customer list never reaches a third party. Longest name first, or
 * "Kakion" would partially rewrite "Kakion Ltd" and leave a mangled remainder.
 */
export async function summariseBooks(profileId?: string): Promise<string> {
  const member = await requireMember();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  let invoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, client_name, status, total, currency, due_date, issue_date, paid_amount")
    .eq("org_id", member.orgId);
  let paymentsQuery = supabase
    .from("payments")
    .select("id, payer_name, total_amount, currency, received_amount, received_currency, payment_date, received_date")
    .eq("org_id", member.orgId);

  if (profileId) {
    invoicesQuery = invoicesQuery.eq("business_profile_id", profileId);
    paymentsQuery = paymentsQuery.eq("business_profile_id", profileId);
  }

  const [invoicesRes, paymentsRes, linksRes] = await Promise.all([
    invoicesQuery,
    paymentsQuery,
    supabase
      .from("payment_invoice_links")
      .select("payment_id, invoice_id, amount_applied")
      .eq("org_id", member.orgId),
  ]);

  // Never summarise a ledger that failed to load — the summary would confidently
  // describe an incomplete picture.
  if (paymentsRes.error || invoicesRes.error) {
    throw new Error("Couldn't read the books, so there's nothing to summarise yet");
  }

  const insights = computeInsights({
    today,
    invoices: invoicesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    links: linksRes.data ?? [],
  });

  if (!insights.length) {
    return "Nothing needs your attention: no overdue invoices, no drafts left sitting, and nothing unusual in the numbers.";
  }

  const names = Array.from(
    new Set([
      ...(invoicesRes.data ?? []).map((i) => i.client_name),
      ...(paymentsRes.data ?? []).map((p) => p.payer_name),
    ])
  )
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const alias = new Map<string, string>();
  names.forEach((n, i) => alias.set(n, `CLIENT_${i + 1}`));

  const hide = (s: string) => {
    let out = s;
    alias.forEach((placeholder, real) => { out = out.split(real).join(placeholder); });
    return out;
  };
  const reveal = (s: string) => {
    let out = s;
    alias.forEach((placeholder, real) => { out = out.split(placeholder).join(real); });
    return out;
  };

  const brief = await writeBrief({
    findings: insights.map((i) => hide(`${i.title}. ${i.detail}`)),
  });

  return reveal(brief);
}

/**
 * A draft the invoice form can be filled from. Nothing here is saved, and no invoice
 * number is reserved — that happens atomically inside `createInvoice` when a person
 * presses save.
 */
export interface InvoiceDraft {
  clientId?: string;
  clientName: string;
  clientCompany?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientGstin?: string;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  items: { description: string; quantity: number; unit_price: number }[];
  taxType?: "none" | "cgst_sgst" | "igst" | "custom";
  taxRate?: number;
  notes?: string;
}

export interface ComposeResult {
  draft: InvoiceDraft;
  /** Plain sentences describing what was understood, shown before the form opens. */
  understood: string[];
  /** Things the person should look at — never blocking, just honest. */
  caveats: string[];
  /** True when an existing client was matched rather than a name being typed in. */
  matchedClient: boolean;
}

interface ClientRow {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  gstin: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The forms of a name worth trying against the client list.
 *
 * "bill harbourline 4 days…" reads as an imperative, and a model sometimes takes the
 * verb to be part of the name. The prompt says otherwise, but a wrong client on an
 * invoice is expensive enough that this doesn't rely on the model getting it right —
 * the stripped form is simply tried as well.
 */
function candidates(name: string): string[] {
  const stripped = name.replace(/^(bill|invoice|charge|send|raise|make|create|for)\s+/i, "").trim();
  return stripped && stripped !== name ? [name, stripped] : [name];
}

/**
 * Compose a draft invoice from a sentence.
 *
 * The instruction goes to the model; the client list does not. Whatever name comes
 * back is matched here, against this org's own rows — so the model can neither leak
 * the customer list nor invent a customer that merely sounds like one.
 */
export async function composeInvoiceDraft(instruction: string): Promise<ComposeResult> {
  const member = await requireMember();

  const text = instruction.trim();
  if (!text) throw new Error("Say what you'd like to invoice for");
  if (text.length > 1000) throw new Error("That's very long — try a sentence or two");

  const today = new Date().toISOString().slice(0, 10);
  const composed = await composeInvoice(text, today);

  const supabase = await createClient();
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, company_name, email, address_line1, city, state, country, gstin")
      .eq("org_id", member.orgId),
    supabase
      .from("business_profiles")
      .select("id, country, state")
      .eq("org_id", member.orgId)
      .order("is_default", { ascending: false })
      .limit(1),
  ]);
  const sender = profiles?.[0];

  // Exact, then case/punctuation-insensitive, then containment either way. Anything
  // looser starts inventing matches, and billing the wrong client is worse than
  // making someone pick from a list.
  let match: ClientRow | undefined;
  let wanted = composed.client_name;
  if (wanted && clients?.length) {
    for (const candidate of candidates(wanted)) {
      const w = norm(candidate);
      const hit =
        clients.find((c) => c.name === candidate) ??
        clients.find((c) => norm(c.name) === w) ??
        clients.find((c) => c.company_name && norm(c.company_name) === w) ??
        clients.find((c) => w.length >= 4 && (norm(c.name).includes(w) || w.includes(norm(c.name))));
      if (hit) {
        match = hit;
        // Report the name that actually matched, not the raw one the model returned.
        wanted = candidate;
        break;
      }
    }
  }

  const understood: string[] = [];
  const caveats: string[] = [];

  if (match) understood.push(`Billing ${match.name}`);
  else if (wanted) {
    understood.push(`Billing ${wanted}`);
    caveats.push(`${wanted} isn't in your clients yet — the name will be typed onto the invoice.`);
  } else {
    caveats.push("No client named — pick one in the form.");
  }

  const total = composed.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  if (composed.items.length) {
    understood.push(
      composed.items.length === 1
        ? `${composed.items[0].description} — ${total.toLocaleString("en-IN")} ${composed.currency ?? ""}`.trim()
        : `${composed.items.length} lines totalling ${total.toLocaleString("en-IN")} ${composed.currency ?? ""}`.trim()
    );
  } else {
    caveats.push("No amount found — add the line items in the form.");
  }

  if (!composed.currency) {
    caveats.push("No currency in the instruction, so the sender profile's default is used.");
  }

  let dueDate: string | undefined;
  if (composed.due_in_days != null) {
    const base = composed.issue_date ?? today;
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + composed.due_in_days);
    dueDate = d.toISOString().slice(0, 10);
    understood.push(`Due ${dueDate}`);
  }

  /**
   * Which GST applies is not something the model can know.
   *
   * CGST+SGST versus IGST turns on whether the sender and the client are in the same
   * Indian state — a fact in the profile and the client row, not in the sentence. So
   * when the instruction says "GST", the split is resolved here with the same
   * `suggestTaxType` the invoice form uses, and the model's guess is discarded.
   */
  let taxType = composed.tax_type;
  if (/\bgst\b/i.test(text) && sender?.country) {
    taxType = suggestTaxType(
      sender.country,
      match?.country ?? sender.country,
      sender.state ?? undefined,
      match?.state ?? undefined
    );
  }

  if (taxType && taxType !== "none") {
    const label =
      taxType === "cgst_sgst" ? "CGST + SGST" : taxType === "igst" ? "IGST" : "tax";
    understood.push(`${composed.tax_rate ?? 0}% ${label}`);
  }

  if (composed.clarification) caveats.push(composed.clarification);

  return {
    matchedClient: !!match,
    understood,
    caveats,
    draft: {
      clientId: match?.id,
      clientName: match?.name ?? wanted ?? "",
      clientCompany: match?.company_name ?? undefined,
      clientEmail: match?.email ?? undefined,
      clientAddress: [match?.address_line1, match?.city, match?.country].filter(Boolean).join(", ") || undefined,
      clientGstin: match?.gstin ?? undefined,
      currency: composed.currency ?? undefined,
      issueDate: composed.issue_date ?? undefined,
      dueDate,
      items: composed.items,
      taxType: taxType ?? undefined,
      taxRate: composed.tax_rate ?? undefined,
      notes: composed.notes ?? undefined,
    },
  };
}
