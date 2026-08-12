import { createClient } from "@/lib/supabase/server";
import { getMember } from "@/lib/auth";
import { getFYConfig, getFYDateRange } from "@/lib/financial-year";
import { inSettlementRange } from "@/lib/earnings";

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  // Prevent CSV injection by prefixing formula-starting characters
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const member = await getMember();
  if (!member) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const profile = url.searchParams.get("profile");
  const fy = url.searchParams.get("fy");

  // Determine FY range
  let fyRange: { start: string; end: string } | null = null;
  if (fy) {
    const profilesRes = await supabase
      .from("business_profiles")
      .select("country")
      .eq("org_id", member.orgId);
    const profiles = profilesRes.data ?? [];
    const selectedCountry = profile
      ? (profiles.find((p) => p.country)?.country ?? null)
      : null;
    const uniqueCountries = Array.from(new Set(profiles.map((p) => p.country).filter(Boolean)));
    const effectiveCountry = selectedCountry ?? (uniqueCountries.length === 1 ? uniqueCountries[0] : null);
    const fyConfig = getFYConfig(effectiveCountry);
    fyRange = getFYDateRange(Number(fy), fyConfig);
  }

  let q = supabase
    .from("payments")
    .select(`
      id, payer_name, total_amount, currency, received_amount, received_currency, received_date,
      payment_date, payment_mode, reference, notes,
      business_profiles(display_name),
      payment_invoice_links(invoices(invoice_number))
    `)
    .eq("org_id", member.orgId)
    .order("payment_date", { ascending: true });

  if (profile) q = q.eq("business_profile_id", profile);

  const { data: payments } = await q;
  // Same basis as the dashboard: the year the money reached the bank.
  const rows = inSettlementRange(payments ?? [], fyRange);

  const headers = [
    "Payment Date", "Payer", "Amount", "Currency", "Received Amount", "Received Currency", "Date Credited",
    "Mode", "Reference", "Invoice(s)", "Notes", "Profile",
  ];

  const csvRows = rows.map((p) => {
    const links = (p.payment_invoice_links ?? []) as unknown as { invoices: { invoice_number: string } | null }[];
    const invoiceNumbers = links.map((l) => l.invoices?.invoice_number ?? "").filter(Boolean).join("; ");
    const profile = p.business_profiles as { display_name?: string } | null;
    return [
      escapeCsv(p.payment_date),
      escapeCsv(p.payer_name),
      escapeCsv(p.total_amount),
      escapeCsv(p.currency),
      escapeCsv(p.received_amount),
      escapeCsv(p.received_currency),
      escapeCsv(p.received_date),
      escapeCsv(p.payment_mode?.replace("_", " ")),
      escapeCsv(p.reference),
      escapeCsv(invoiceNumbers),
      escapeCsv(p.notes),
      escapeCsv(profile?.display_name),
    ].join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payments-${date}.csv"`,
    },
  });
}
