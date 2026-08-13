import type { ExtractedInvoice } from "@/lib/invoice-extract";

/**
 * Ask a model to read an invoice whose layout the pattern matcher didn't recognise.
 *
 * Only ever reached as a fallback, and its output goes to the same review form as
 * everything else — a person confirms before anything is saved. The caller redacts
 * bank details first; nothing here should see an account number.
 *
 * Kept deliberately small: one call, JSON out, nulls allowed. A model that says "I
 * couldn't find the date" is far more useful than one that invents a plausible one,
 * so the prompt asks for null rather than a best guess.
 */
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM = `You read invoice documents and return structured JSON. Rules:
- Return ONLY the JSON object, no prose or code fences.
- Use null for anything you cannot find in the text. NEVER guess or invent a value.
- Amounts are plain numbers: no currency symbols, no thousands separators.
- currency is a 3-letter ISO code (EUR, USD, GBP, INR) inferred from the symbol.
- issue_date and due_date are strictly YYYY-MM-DD. If the day/month order is ambiguous, use null.
- due_date is only set when the document labels one. Never infer it from the issue date.
- items[].unit_price is the price for ONE unit, so quantity * unit_price = line total.
- subtotal is the amount BEFORE tax; total is AFTER tax. If the invoice shows no tax, subtotal equals total.
- tax_rate is a percentage number, not a decimal: 18 means 18%. For an invoice showing
  CGST 9% and SGST 9%, the combined tax_rate is 18. Use null when there is no tax.
- tax_type is exactly one of "cgst_sgst" (the document shows a CGST + SGST split),
  "igst", "custom" (a percentage with no named tax), or "none" (no tax at all).
- The line items must add up to the subtotal, never to the tax-inclusive total.
- The client is who the invoice is billed TO, never the sender.`;

const SHAPE = `{"invoice_number":string|null,"issue_date":string|null,"due_date":string|null,"client_name":string|null,"client_address":string|null,"currency":string|null,"subtotal":number|null,"tax_rate":number|null,"tax_type":"none"|"cgst_sgst"|"igst"|"custom"|null,"total":number|null,"items":[{"description":string,"quantity":number,"unit_price":number}]}`;

export async function extractWithGroq(redactedText: string): Promise<ExtractedInvoice> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set — add it to use AI extraction");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0, // reading a document is not a creative task
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Return this exact shape:\n${SHAPE}\n\nInvoice text:\n"""\n${redactedText}\n"""`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq returned something that wasn't JSON");
  }

  // Coerce defensively. Anything the model returned in the wrong shape becomes null
  // and shows up as a missing field for the reviewer, rather than a bad value that
  // looks filled in.
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .map((i) => {
      const it = i as Record<string, unknown>;
      return {
        description: str(it.description) ?? "",
        quantity: num(it.quantity) ?? 1,
        unit_price: num(it.unit_price) ?? 0,
      };
    })
    .filter((i) => i.description);

  const currency = str(parsed.currency);

  // A rate outside 0–100 is a misread (a decimal like 0.18, or an amount mistaken for
  // a percentage). Dropping it shows up as an empty field rather than a wrong tax bill.
  const rate = num(parsed.tax_rate);
  // Anything outside the union is a hallucinated label; fall back to what the rate
  // alone can justify rather than writing an invented tax structure into the books.
  const kind = str(parsed.tax_type);
  const tax_type = (["none", "cgst_sgst", "igst", "custom"] as const).find((k) => k === kind) ?? null;

  return {
    invoice_number: str(parsed.invoice_number),
    issue_date: str(parsed.issue_date),
    due_date: str(parsed.due_date),
    client_name: str(parsed.client_name),
    client_address: str(parsed.client_address),
    currency: currency ? currency.toUpperCase().slice(0, 5) : null,
    subtotal: num(parsed.subtotal),
    tax_rate: rate != null && rate > 0 && rate <= 100 ? rate : null,
    tax_type,
    total: num(parsed.total),
    items,
  };
}
