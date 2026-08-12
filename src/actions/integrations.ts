"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { logInvoiceEvent } from "@/lib/invoice-events";
import { encryptToken, decryptToken } from "@/lib/token-crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { TemplateWhiteCaps } from "@/components/pdf/templates/template-white-caps";
import { TemplateCreamSerif } from "@/components/pdf/templates/template-cream-serif";
import type { PaymentMethodSnapshot } from "@/types/app.types";
import { registerFonts } from "@/lib/pdf/fonts";
import React from "react";

async function getValidDriveToken(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: token } = await supabase
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("org_id", orgId)
    .eq("provider", "google_drive")
    .single();

  if (!token) throw new Error("Google Drive not connected — go to Settings to connect");

  const isExpired = token.expires_at && new Date(token.expires_at) <= new Date(Date.now() + 60_000);

  if (!isExpired) return decryptToken(token.access_token as string);

  if (!token.refresh_token) throw new Error("Drive token expired and no refresh token — reconnect in Settings");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decryptToken(token.refresh_token as string),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Google token — reconnect in Settings");

  const refreshed = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("oauth_tokens")
    .update({ access_token: encryptToken(refreshed.access_token), expires_at: expiresAt })
    .eq("org_id", orgId)
    .eq("provider", "google_drive");

  return refreshed.access_token;
}

async function getOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const conditions = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parentId) conditions.push(`'${parentId}' in parents`);

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(conditions.join(" and "))}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (searchRes.ok) {
    const data = await searchRes.json() as { files: { id: string }[] };
    if (data.files.length > 0) return data.files[0].id;
  }

  const body: Record<string, unknown> = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) throw new Error(`Drive: could not create folder "${name}"`);
  const folder = await createRes.json() as { id: string };
  return folder.id;
}

async function uploadPdfToDrive(
  accessToken: string,
  pdfBuffer: Buffer,
  filename: string,
  parentId?: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata: Record<string, unknown> = { name: filename, mimeType: "application/pdf" };
  if (parentId) metadata.parents = [parentId];

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

  return uploadRes.json() as Promise<{ id: string; webViewLink: string }>;
}

export async function exportInvoiceToDrive(invoiceId: string): Promise<{ url: string }> {
  const member = await requireMember();
  const supabase = await createClient();

  const accessToken = await getValidDriveToken(supabase, member.orgId);

  const [invoiceRes, itemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url, drive_root_folder_id)`)
      .eq("id", invoiceId)
      .eq("org_id", member.orgId)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", invoiceId)
      .eq("org_id", member.orgId)
      .order("sort_order"),
  ]);

  if (!invoiceRes.data) throw new Error("Invoice not found");

  const invoice = { ...invoiceRes.data, items: itemsRes.data ?? [] };
  const profile = invoice.business_profiles as Record<string, string> | null;
  const profileName = profile?.display_name ?? "Default";

  // Resolve folder hierarchy: 7Gence Invoice Maker / {Profile} / Invoices
  let profileFolderId = profile?.drive_root_folder_id ?? null;
  if (!profileFolderId) {
    const rootFolderId = await getOrCreateFolder(accessToken, "7Gence Invoice Maker");
    profileFolderId = await getOrCreateFolder(accessToken, profileName, rootFolderId);
    await supabase
      .from("business_profiles")
      .update({ drive_root_folder_id: profileFolderId })
      .eq("id", invoice.business_profile_id);
  }
  const invoicesFolderId = await getOrCreateFolder(accessToken, "Invoices", profileFolderId);

  registerFonts();
  const Template = invoice.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;

  let fileId: string;
  let url: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice }) as any);
    const result = await uploadPdfToDrive(accessToken, pdfBuffer, `Invoice-${invoice.invoice_number}.pdf`, invoicesFolderId);
    fileId = result.id;
    url = result.webViewLink;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Drive export failed — check your Google connection");
  }

  await supabase
    .from("invoices")
    .update({ drive_url: url, drive_file_id: fileId })
    .eq("id", invoiceId)
    .eq("org_id", member.orgId);

  await logInvoiceEvent(invoiceId, "exported_to_drive", { url });

  return { url };
}

export async function exportReceiptToDrive(receiptId: string): Promise<{ url: string }> {
  const member = await requireMember();
  const supabase = await createClient();

  const accessToken = await getValidDriveToken(supabase, member.orgId);

  const { data: receipt } = await supabase
    .from("receipts")
    .select(`*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url, drive_root_folder_id), invoices(invoice_number)`)
    .eq("id", receiptId)
    .eq("org_id", member.orgId)
    .single();

  if (!receipt) throw new Error("Receipt not found");

  const profile = receipt.business_profiles as Record<string, string> | null;
  const profileName = profile?.display_name ?? "Default";

  // Resolve folder hierarchy: 7Gence Invoice Maker / {Profile} / Receipts
  let profileFolderId = profile?.drive_root_folder_id ?? null;
  if (!profileFolderId) {
    const rootFolderId = await getOrCreateFolder(accessToken, "7Gence Invoice Maker");
    profileFolderId = await getOrCreateFolder(accessToken, profileName, rootFolderId);
    await supabase
      .from("business_profiles")
      .update({ drive_root_folder_id: profileFolderId })
      .eq("id", receipt.business_profile_id);
  }
  const receiptsFolderId = await getOrCreateFolder(accessToken, "Receipts", profileFolderId);

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
    linked_invoice_number: (receipt.invoices as { invoice_number: string } | null)?.invoice_number ?? null,
    payment_method_snapshot: receipt.payment_method_snapshot as PaymentMethodSnapshot | null,
    business_profiles: receipt.business_profiles,
    items: [],
  };

  const Template = receipt.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice: receiptData, documentType: "receipt" }) as any);
  const { id: fileId, webViewLink } = await uploadPdfToDrive(
    accessToken, pdfBuffer, `Receipt-${receipt.receipt_number}.pdf`, receiptsFolderId
  );

  await supabase
    .from("receipts")
    .update({ drive_url: webViewLink, drive_file_id: fileId })
    .eq("id", receiptId)
    .eq("org_id", member.orgId);

  return { url: webViewLink };
}

export async function removeFromDrive(kind: "invoice" | "receipt", id: string): Promise<{ deleted: boolean }> {
  const member = await requireMember();
  const supabase = await createClient();

  const table = kind === "invoice" ? "invoices" : "receipts";

  const { data: record } = await supabase
    .from(table)
    .select("drive_file_id")
    .eq("id", id)
    .eq("org_id", member.orgId)
    .single();

  let deleted = false;
  if (record?.drive_file_id) {
    const accessToken = await getValidDriveToken(supabase, member.orgId);
    const delRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${record.drive_file_id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    // 404 means already gone — still clean up DB
    if (!delRes.ok && delRes.status !== 404) {
      throw new Error("Failed to remove file from Drive");
    }
    deleted = true;
  }

  await supabase
    .from(table)
    .update({ drive_url: null, drive_file_id: null })
    .eq("id", id)
    .eq("org_id", member.orgId);

  revalidatePath(`/${kind === "invoice" ? "invoices" : "receipts"}/${id}`);
  return { deleted };
}

export async function disconnectGoogleDrive() {
  const member = await requireMember();
  const supabase = await createClient();

  await supabase
    .from("oauth_tokens")
    .delete()
    .eq("org_id", member.orgId)
    .eq("provider", "google_drive");
}
