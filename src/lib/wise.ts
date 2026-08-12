export interface WiseField {
  label: string;
  value: string;
}

export interface ParsedWise {
  currency: string | null;
  name: string | null;
  fields: WiseField[];
}

const HEADER = /Here are the ([A-Z]{3}) account details/;
const HEADER_ALL = /Here are the [A-Z]{3} account details/g;

// Wise blocks are "Label: Value" lines mixed with prose ("Use when sending money from the US"),
// a header sentence and `---` fences. Prose has no colon, so a first-colon split separates them.
// The 40-char label cap stops a prose sentence that happens to contain a colon from becoming a field.
export function parseWiseDetails(raw: string): ParsedWise {
  if ((raw.match(HEADER_ALL) ?? []).length > 1) {
    throw new Error("Paste one currency block at a time — found details for several currencies.");
  }

  const fields: WiseField[] = [];
  let name: string | null = null;

  for (const line of raw.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;

    const label = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!value || label.length > 40) continue;

    // Name is stored separately as the beneficiary — it must match the GST-registered legal name.
    if (label.toLowerCase() === "name") {
      name ??= value;
      continue;
    }
    fields.push({ label, value });
  }

  return { currency: raw.match(HEADER)?.[1] ?? null, name, fields };
}
