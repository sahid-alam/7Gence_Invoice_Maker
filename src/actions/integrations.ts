"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { TemplateWhiteCaps } from "@/components/pdf/templates/template-white-caps";
import { TemplateCreamSerif } from "@/components/pdf/templates/template-cream-serif";
import { registerFonts } from "@/lib/pdf/fonts";
import React from "react";

async function getValidDriveToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: token } = await supabase
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("owner_id", userId)
    .eq("provider", "google_drive")
    .single();

  if (!token) throw new Error("Google Drive not connected — go to Settings to connect");

  const isExpired = token.expires_at && new Date(token.expires_at) <= new Date(Date.now() + 60_000);

  if (!isExpired) return token.access_token as string;

  if (!token.refresh_token) throw new Error("Drive token expired and no refresh token — reconnect in Settings");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Google token — reconnect in Settings");

  const refreshed = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("oauth_tokens")
    .update({ access_token: refreshed.access_token, expires_at: expiresAt })
    .eq("owner_id", userId)
    .eq("provider", "google_drive");

  return refreshed.access_token;
}

async function uploadPdfToDrive(accessToken: string, pdfBuffer: Buffer, filename: string): Promise<string> {
  const metadata = { name: filename, mimeType: "application/pdf" };
  const boundary = "-------7Gence_boundary";

  const metaBytes = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const fileHeaderBytes = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const closingBytes = new TextEncoder().encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(metaBytes.length + fileHeaderBytes.length + pdfBuffer.length + closingBytes.length);
  let offset = 0;
  body.set(metaBytes, offset); offset += metaBytes.length;
  body.set(fileHeaderBytes, offset); offset += fileHeaderBytes.length;
  body.set(pdfBuffer, offset); offset += pdfBuffer.length;
  body.set(closingBytes, offset);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Drive upload failed: ${err}`);
  }

  const file = await uploadRes.json() as { id: string; webViewLink: string };
  return file.webViewLink;
}

export async function exportInvoiceToDrive(invoiceId: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accessToken = await getValidDriveToken(supabase, user.id);

  const [invoiceRes, itemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)`)
      .eq("id", invoiceId)
      .eq("owner_id", user.id)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", invoiceId)
      .order("sort_order"),
  ]);

  if (!invoiceRes.data) throw new Error("Invoice not found");

  registerFonts();
  const invoice = { ...invoiceRes.data, items: itemsRes.data ?? [] };
  const Template = invoice.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice }) as any);

  const url = await uploadPdfToDrive(accessToken, pdfBuffer, `Invoice-${invoice.invoice_number}.pdf`);

  await supabase.from("invoices").update({ drive_url: url }).eq("id", invoiceId).eq("owner_id", user.id);

  return { url };
}

export async function exportReceiptToDrive(receiptId: string): Promise<{ url: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accessToken = await getValidDriveToken(supabase, user.id);

  const { data: receipt } = await supabase
    .from("receipts")
    .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)`)
    .eq("id", receiptId)
    .eq("owner_id", user.id)
    .single();

  if (!receipt) throw new Error("Receipt not found");

  registerFonts();

  const receiptData = {
    invoice_number: receipt.receipt_number,
    issue_date: receipt.payment_date,
    due_date: null,
    currency: receipt.currency,
    subtotal: receipt.amount,
    tax_type: "none",
    tax_amount: 0,
    cgst_rate: null,
    sgst_rate: null,
    tax_rate: null,
    discount_amount: 0,
    total: receipt.amount,
    client_name: receipt.client_name,
    client_company: receipt.client_company,
    client_address: receipt.client_address,
    client_gstin: null,
    sender_gstin: null,
    notes: receipt.notes,
    payment_method_snapshot: receipt.payment_method_snapshot as Record<string, string> | null,
    business_profiles: receipt.business_profiles,
    items: [{ description: `Payment Receipt — ${receipt.receipt_number}`, quantity: 1, unit_price: receipt.amount }],
  };

  const Template = receipt.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice: receiptData }) as any);

  const url = await uploadPdfToDrive(accessToken, pdfBuffer, `Receipt-${receipt.receipt_number}.pdf`);

  await supabase.from("receipts").update({ drive_url: url }).eq("id", receiptId).eq("owner_id", user.id);

  return { url };
}

export async function disconnectGoogleDrive() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("oauth_tokens")
    .delete()
    .eq("owner_id", user.id)
    .eq("provider", "google_drive");
}
