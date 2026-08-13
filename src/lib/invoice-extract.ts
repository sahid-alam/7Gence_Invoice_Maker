/**
 * Reading an old invoice PDF well enough to pre-fill a form.
 *
 * Deliberately never returns something to save directly. Everything here produces a
 * *draft for review*: fields it is confident about, fields it could not find, and any
 * arithmetic that does not reconcile. A human confirms before anything reaches the
 * books — which is what makes it safe to fall back to a language model when the
 * layout is one this does not recognise.
 *
 * No value imports, so it can be unit-tested directly with node --test.
 */

export interface ExtractedItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface ExtractedInvoice {
  invoice_number: string | null;
  issue_date: string | null;      // YYYY-MM-DD
  due_date: string | null;        // YYYY-MM-DD
  client_name: string | null;
  client_address: string | null;
  currency: string | null;
  /** Before tax. Null when the invoice shows no separate subtotal line. */
  subtotal: number | null;
  /** Percentage, e.g. 18 for 18% — the UI works in percentages, not decimals. */
  tax_rate: number | null;
  /**
   * Which kind of tax the document showed. Mirrors the `TaxType` union, declared
   * locally so this file keeps zero imports and stays directly unit-testable.
   * `custom` means a rate was found but not what kind — an unlabelled percentage.
   */
  tax_type: "none" | "cgst_sgst" | "igst" | "custom" | null;
  total: number | null;
  items: ExtractedItem[];
}

export interface ExtractionResult extends ExtractedInvoice {
  /** Which of the fields that matter came back empty. */
  missing: string[];
  /** Arithmetic or sanity problems the reviewer must look at. */
  warnings: string[];
  source: "pattern" | "ai" | "manual";
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "€": "EUR", "$": "USD", "£": "GBP", "₹": "INR", "₮": "USDT",
};

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

/**
 * Some generators emit one glyph at a time — "K a k i o n  O S" — with single spaces
 * between letters and double between words. A line is letter-spaced when most of its
 * space-separated tokens are a single character, which is what distinguishes it from
 * ordinary prose. unpdf usually joins these already; this is the safety net for the
 * exports that don't.
 */
export function despace(line: string): string {
  const toks = line.split(" ").filter(Boolean);
  if (toks.length < 4) return line.trim();
  const singles = toks.filter((t) => t.length === 1).length;
  if (singles / toks.length < 0.6) return line.trim();
  // Double space marks a real word break, single space is inter-glyph. Park the word
  // breaks on a sentinel, drop every remaining space, then put the breaks back.
  // The sentinel is written as an escape, not a literal control character — a raw
  // NUL in the source makes the whole file read as binary to grep and diff.
  return line.replace(/ {2}/g, "\u0001").replace(/ /g, "").replace(/\u0001/g, " ").trim();
}

export function normalise(raw: string): string {
  return raw
    .split("\n")
    .map(despace)
    .filter(Boolean)
    .join("\n");
}

/**
 * Remove the payee's bank block before any of this leaves the machine.
 *
 * An imported invoice's payment details are irrelevant — a re-issued 7Gence invoice
 * takes its payment block from the sender profile. So account numbers, IFSC and
 * sort codes have no reason to reach a third-party model, and stripping them is
 * deterministic rather than best-effort.
 */
export function redactBankDetails(text: string): string {
  return text
    .split("\n")
    .filter(
      (l) =>
        !/^\s*(bank details|account no|account number|a\/c|ifsc|sort code|swift|iban|routing)/i.test(l)
    )
    .map((l) =>
      l
        .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "[redacted-ifsc]")   // IFSC
        .replace(/\b\d{9,18}\b/g, "[redacted-account]")            // long bare numbers
    )
    .join("\n");
}

/** "24, JUNE 2026" · "24 June 2026" · "2026-06-24" · "24/06/2026" → YYYY-MM-DD */
export function parseDate(s: string): string | null {
  const t = s.trim();

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = t.match(/\b(\d{1,2})\s*,?\s*([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})\b/);
  if (named) {
    const idx = MONTHS.findIndex((m) => m.startsWith(named[2].toLowerCase().slice(0, 3)));
    if (idx >= 0) return `${named[3]}-${String(idx + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }

  const namedFirst = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/);
  if (namedFirst) {
    const idx = MONTHS.findIndex((m) => m.startsWith(namedFirst[1].toLowerCase().slice(0, 3)));
    if (idx >= 0) return `${namedFirst[3]}-${String(idx + 1).padStart(2, "0")}-${namedFirst[2].padStart(2, "0")}`;
  }

  // Day-first: unambiguous only when the first part is > 12, otherwise it is a guess
  // and a wrong invoice date is worse than an empty one the reviewer must fill.
  const slash = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (slash && Number(slash[1]) > 12) {
    return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(s: string): number {
  return Number(s.replace(/[^\d.]/g, "")) || 0;
}

const MONEY = /([€$£₹₮])\s?([\d,]+(?:\.\d{1,2})?)/;

/**
 * The first money figure in a fragment.
 *
 * Extractors concatenate adjacent runs, so the text after a "Subtotal" label often
 * reads "€400.00Tax€72.00" — stripping non-digits from the whole fragment would
 * produce 400.0072. Matching one figure and stopping is what keeps it correct.
 */
function firstAmount(s: string): number | null {
  const m = s.match(MONEY);
  return m ? parseAmount(m[2]) : null;
}

/** Label-and-order matching. Returns nulls rather than guesses. */
export function extractByPattern(rawText: string): ExtractedInvoice {
  const text = normalise(rawText);
  const lines = text.split("\n");

  const after = (label: RegExp): string | null => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(label);
      if (!m) continue;
      const inline = lines[i].slice(m.index! + m[0].length).trim();
      if (inline) return inline;
      if (lines[i + 1]) return lines[i + 1].trim();
    }
    return null;
  };

  // Extractors often concatenate adjacent text runs with no separator, so the raw
  // line reads "Invoice No. 7GKZInvoiceBilled to:". The number therefore ends at the
  // next CamelCase boundary — a capital followed by a lowercase, i.e. the start of
  // the next word — rather than at whitespace. The capture is case-sensitive on
  // purpose; with /i, [A-Z0-9] would match the lowercase letters too and swallow them.
  const numMatch = text.match(/invoice\s*(?:no|number|#)\.?\s*:?\s*/i);
  const invoice_number = numMatch
    ? (text
        .slice(numMatch.index! + numMatch[0].length)
        .match(/^([A-Z0-9][A-Z0-9\-/]*?)(?=[A-Z][a-z]|[^A-Z0-9\-/]|$)/)?.[1] ?? null)
    : null;

  // The first date on the page is the issue date in every layout seen so far. A due
  // date only counts when something actually labels it — an unlabelled second date
  // is as likely to be a delivery date or a period end.
  let issue_date: string | null = null;
  for (const l of lines) {
    const d = parseDate(l);
    if (d) { issue_date = d; break; }
  }
  const dueLine = after(/(?:due\s*date|payment\s*due|due\s*on)\s*:?/i);
  const due_date = dueLine ? parseDate(dueLine) : null;

  const client_name = after(/billed\s*to\s*:?/i);
  let client_address: string | null = null;
  const billedIdx = lines.findIndex((l) => /billed\s*to\s*:?/i.test(l));
  if (billedIdx >= 0) {
    const start = lines[billedIdx].replace(/.*billed\s*to\s*:?/i, "").trim() ? billedIdx : billedIdx + 1;
    const block = lines.slice(start + 1, start + 5).filter((l) => l && !/^(description|amount|total)/i.test(l));
    if (block.length) client_address = block.join(", ");
  }

  // Plain exec loop rather than matchAll: the build targets a JS version whose
  // iterator protocol tsc won't downlevel without extra flags.
  const money: RegExpExecArray[] = [];
  const moneyRe = /([€$£₹₮])\s?([\d,]+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = moneyRe.exec(text)) !== null) money.push(m);

  const currency = money.length ? (CURRENCY_BY_SYMBOL[money[0][1]] ?? null) : null;
  // The largest figure is the total far more reliably than "the last one" — a
  // layout that prints Total above the line items would break a positional rule.
  const amounts = money.map((m) => parseAmount(m[2]));
  const total = amounts.length ? Math.max(...amounts) : null;

  // A taxed invoice's line items add up to the subtotal, not the total. Reading the
  // subtotal is what lets the reconciliation check tell a genuine misread apart from
  // the tax the invoice legitimately carries.
  const subtotalLine = after(/sub\s*-?\s*total\s*:?/i);
  const subtotal = subtotalLine ? firstAmount(subtotalLine) : null;

  const rateMatch = text.match(
    /(?:gst|igst|cgst|sgst|vat|tax)[^\d%\n]{0,24}?(\d{1,2}(?:\.\d{1,2})?)\s*%/i
  );
  let tax_rate = rateMatch ? Number(rateMatch[1]) : null;
  let tax_type: ExtractedInvoice["tax_type"] = null;
  if (rateMatch) {
    // CGST and SGST are each half the rate, so a document showing "CGST 9%" is an 18%
    // invoice. Doubling it here means the UI's single rate field stays correct.
    if (/cgst|sgst/i.test(rateMatch[0])) { tax_rate = tax_rate! * 2; tax_type = "cgst_sgst"; }
    else if (/igst/i.test(rateMatch[0])) tax_type = "igst";
    else tax_type = "custom";  // a percentage, but the document didn't say of what
  }

  const description = after(/description\s*:?/i);
  const base = subtotal ?? total;
  const items: ExtractedItem[] =
    description && base != null
      ? [{ description, quantity: 1, unit_price: base }]
      : [];

  return {
    invoice_number, issue_date, due_date, client_name, client_address,
    currency, subtotal, tax_rate, tax_type, total, items,
  };
}

/**
 * What a reviewer needs flagged: fields nothing found, and arithmetic that does not
 * reconcile. The sum check is the one that matters — it is a deterministic test on
 * output that may have come from a language model, so a misread digit has to be
 * wrong *consistently* to survive it.
 */
export function review(inv: ExtractedInvoice, source: "pattern" | "ai" | "manual"): ExtractionResult {
  const missing: string[] = [];
  if (!inv.invoice_number) missing.push("invoice number");
  if (!inv.issue_date) missing.push("date");
  if (!inv.client_name) missing.push("client");
  if (!inv.currency) missing.push("currency");
  if (inv.total == null) missing.push("total");
  if (!inv.items.length) missing.push("line items");

  const warnings: string[] = [];
  // Line items add up to the SUBTOTAL. Comparing them against a tax-inclusive total
  // would flag every correct GST invoice as broken, so reconcile against the subtotal
  // whenever the document showed one.
  const base = inv.subtotal ?? inv.total;
  if (inv.items.length && base != null) {
    const sum = inv.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    // Work in integer cents; a float comparison here would flag correct invoices.
    if (Math.round(sum * 100) !== Math.round(base * 100)) {
      warnings.push(
        `Line items add up to ${sum.toFixed(2)} but the invoice reads ${base.toFixed(2)} — check before saving.`
      );
    } else if (
      inv.subtotal == null &&
      inv.total != null &&
      inv.tax_rate != null &&
      inv.tax_rate > 0
    ) {
      // Tax was found but no subtotal, so the lines were filled from the total and
      // now double-count the tax. Say so rather than let it save silently.
      warnings.push(
        `This invoice shows ${inv.tax_rate}% tax but no subtotal line — the line item was filled from the total. Set the tax below and correct the amount.`
      );
    }
  }
  if (inv.total != null && inv.total <= 0) warnings.push("Total is zero or negative.");
  if (inv.issue_date && inv.issue_date > new Date().toISOString().slice(0, 10)) {
    warnings.push("The date is in the future — check it was read correctly.");
  }

  return { ...inv, missing, warnings, source };
}
