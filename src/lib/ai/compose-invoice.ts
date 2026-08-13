/**
 * Turning a sentence into a draft invoice.
 *
 * "Invoice Kakion €1,200 for Kakion OS phase 3, due in 30 days" is a faster way to
 * start an invoice than nine form fields, and it is a genuinely good fit for a model:
 * the input is unstructured, the output is a fixed shape, and a person reviews the
 * result before anything is saved.
 *
 * Two deliberate limits:
 *
 * 1. **It fills a form, it does not create an invoice.** The composed draft lands in
 *    the normal `/invoices/new` form for a human to confirm. Nothing is written, and
 *    no invoice number is drawn — `createInvoice` calls `next_invoice_number()` at
 *    save time, so an abandoned AI draft can't burn a number out of a GST series that
 *    is supposed to be sequential.
 *
 * 2. **The client list never leaves the machine.** The model only sees the sentence
 *    the user typed. It returns whatever name it read, and the *caller* matches that
 *    against the org's clients locally. A model that never saw the customer list
 *    cannot leak it, and cannot invent a customer that sounds plausible.
 *
 * Strict structured outputs mean the response is schema-valid by construction rather
 * than by hopeful parsing — on Groq that requires the gpt-oss models, which is why
 * this doesn't use the same model as the PDF importer.
 */

const MODEL = "openai/gpt-oss-120b";

export const COMPOSE_CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "USDT"] as const;

export interface ComposedItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface ComposedInvoice {
  client_name: string | null;
  currency: string | null;
  issue_date: string | null;
  due_in_days: number | null;
  tax_type: "none" | "cgst_sgst" | "igst" | "custom" | null;
  tax_rate: number | null;
  items: ComposedItem[];
  notes: string | null;
  /** What the model could not settle, phrased for the person to answer. */
  clarification: string | null;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "client_name", "currency", "issue_date", "due_in_days",
    "tax_type", "tax_rate", "items", "notes", "clarification",
  ],
  properties: {
    client_name: { type: ["string", "null"] },
    currency: { type: ["string", "null"], enum: [...COMPOSE_CURRENCIES, null] },
    issue_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    due_in_days: { type: ["integer", "null"] },
    tax_type: { type: ["string", "null"], enum: ["none", "cgst_sgst", "igst", "custom", null] },
    tax_rate: { type: ["number", "null"], description: "percentage, e.g. 18" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit_price"],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
        },
      },
    },
    notes: { type: ["string", "null"] },
    clarification: { type: ["string", "null"] },
  },
} as const;

const SYSTEM = `You turn a short instruction into the fields of a single draft invoice.

Rules:
- Use null for anything the instruction does not state. NEVER invent a client, an amount, or a date.
- The instruction is usually phrased as a command and starts with a verb: "bill Acme…",
  "invoice Acme…", "charge Acme…", "send Acme…". That verb is NOT part of the client's name.
  client_name for "bill harbourline for 4 days" is "harbourline", never "bill harbourline".
- unit_price is the price for ONE unit, so quantity * unit_price is that line's total.
  "5 days at $400" is quantity 5, unit_price 400. "$1,200 for phase 3" is quantity 1, unit_price 1200.
- Infer currency from a symbol or code in the text (€ = EUR, $ = USD, £ = GBP, ₹ = INR). Otherwise null.
- due_in_days is a count of days: "due in 30 days" is 30, "net 15" is 15, "due on receipt" is 0.
  If no due date is mentioned, null.
- issue_date is YYYY-MM-DD, resolved against today's date given below. If not mentioned, null.
- tax_type: "cgst_sgst" or "igst" only if GST is explicitly mentioned, "custom" for any other
  named percentage, "none" if the text says no tax. Otherwise null. tax_rate is a percentage number.
- The description should read like an invoice line, not like the instruction. Keep the user's own
  wording for the work; don't add words like "services" or "project" that they didn't use.
- clarification: one short question ONLY if something essential (who, what, or how much) is missing
  or genuinely ambiguous. Otherwise null. Do not ask about optional fields.`;

export async function composeInvoice(
  instruction: string,
  today: string
): Promise<ComposedInvoice> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0, // reading an instruction is not a creative task
      response_format: {
        type: "json_schema",
        json_schema: { name: "draft_invoice", strict: true, schema: SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Today is ${today}.\n\nInstruction:\n"""\n${instruction}\n"""` },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("The model returned nothing");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("The model returned something that wasn't JSON");
  }

  // Strict mode guarantees the shape, but this is money: coerce anyway, so a schema
  // change on their side degrades to an empty field rather than a bad number.
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const rate = num(parsed.tax_rate);
  const currency = str(parsed.currency);
  const taxType = str(parsed.tax_type);

  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      return {
        description: str(it.description) ?? "",
        quantity: num(it.quantity) ?? 1,
        unit_price: num(it.unit_price) ?? 0,
      };
    })
    .filter((i) => i.description);

  return {
    client_name: str(parsed.client_name),
    currency: COMPOSE_CURRENCIES.includes(currency as never) ? currency : null,
    issue_date: /^\d{4}-\d{2}-\d{2}$/.test(str(parsed.issue_date) ?? "")
      ? str(parsed.issue_date)
      : null,
    due_in_days: num(parsed.due_in_days),
    tax_type: (["none", "cgst_sgst", "igst", "custom"] as const).find((t) => t === taxType) ?? null,
    tax_rate: rate != null && rate >= 0 && rate <= 100 ? rate : null,
    items,
    notes: str(parsed.notes),
    clarification: str(parsed.clarification),
  };
}
