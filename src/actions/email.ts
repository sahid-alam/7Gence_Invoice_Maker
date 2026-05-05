"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";
import { formatCurrency } from "@/lib/currency";
import { encryptToken, decryptToken } from "@/lib/token-crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { TemplateWhiteCaps } from "@/components/pdf/templates/template-white-caps";
import { TemplateCreamSerif } from "@/components/pdf/templates/template-cream-serif";
import { registerFonts } from "@/lib/pdf/fonts";
import React from "react";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function sendInvoiceEmail(invoiceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [invoiceRes, itemsRes, tokenRes, settingsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)")
      .eq("id", invoiceId)
      .eq("owner_id", user.id)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", invoiceId)
      .eq("owner_id", user.id)
      .order("sort_order"),
    supabase
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("owner_id", user.id)
      .eq("provider", "google_drive")
      .single(),
    supabase
      .from("app_settings")
      .select("gmail_user, email_subject, email_intro")
      .eq("owner_id", user.id)
      .single(),
  ]);

  if (!invoiceRes.data) throw new Error("Invoice not found");
  if (!invoiceRes.data.client_email) throw new Error("No client email on this invoice");

  if (!tokenRes.data) {
    throw new Error("Google account not connected — go to Settings to connect Google");
  }

  const gmailUser = settingsRes.data?.gmail_user;
  if (!gmailUser) {
    throw new Error("Gmail address not found — reconnect Google in Settings");
  }

  const invoice = invoiceRes.data;
  const formattedAmount = formatCurrency(invoice.total, invoice.currency);
  const vars: Record<string, string> = {
    client_name: invoice.client_name ?? "",
    invoice_number: invoice.invoice_number,
    amount: formattedAmount,
    due_date: invoice.due_date ?? "",
  };
  function applyVars(template: string) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? `{{${key}}}`));
  }

  const subjectTemplate = settingsRes.data?.email_subject?.trim() || "Invoice {{invoice_number}} — {{amount}} due";
  const introTemplate = settingsRes.data?.email_intro?.trim() || "Please find your invoice attached.";
  const emailSubject = applyVars(escapeHtml(subjectTemplate));
  const emailIntro = applyVars(escapeHtml(introTemplate));

  let accessToken = decryptToken(tokenRes.data.access_token);
  const refreshTokenRaw = tokenRes.data.refresh_token ? decryptToken(tokenRes.data.refresh_token) : null;

  // Refresh token if expired
  if (tokenRes.data.expires_at && new Date(tokenRes.data.expires_at) <= new Date(Date.now() + 60_000)) {
    if (!refreshTokenRaw) {
      throw new Error("Google token expired — reconnect in Settings");
    }
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshTokenRaw,
        grant_type: "refresh_token",
      }),
    });
    if (!refreshRes.ok) throw new Error("Failed to refresh Google token — reconnect in Settings");
    const refreshed = await refreshRes.json() as { access_token: string; expires_in: number };
    accessToken = refreshed.access_token;
    await supabase
      .from("oauth_tokens")
      .update({ access_token: encryptToken(accessToken), expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
      .eq("owner_id", user.id)
      .eq("provider", "google_drive");
  }

  // Generate PDF attachment
  registerFonts();
  const invoiceWithItems = { ...invoice, items: itemsRes.data ?? [] };
  const Template = invoice.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice: invoiceWithItems }) as any);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: gmailUser,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: refreshTokenRaw ?? undefined,
      accessToken: accessToken,
    },
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="font-size: 20px; margin-bottom: 4px;">Invoice ${escapeHtml(invoice.invoice_number)}</h2>
      <p style="color: #666; margin-top: 0;">from 7Gence</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p>Hi ${escapeHtml(invoice.client_name ?? "")},</p>
      <p>${emailIntro}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Invoice number</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${escapeHtml(invoice.invoice_number)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Amount due</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${formattedAmount}</td>
        </tr>
        ${invoice.due_date ? `
        <tr>
          <td style="padding: 8px 0; color: #666;">Due date</td>
          <td style="padding: 8px 0; text-align: right;">${escapeHtml(invoice.due_date)}</td>
        </tr>` : ""}
      </table>
      <p style="margin-top: 32px; font-size: 13px; color: #999;">
        This email was sent by 7Gence Invoice Maker. Please reply to this email if you have any questions.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `7Gence <${gmailUser}>`,
      to: invoice.client_email,
      subject: emailSubject,
      html,
      attachments: [
        {
          filename: `Invoice-${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to send email — check your Google connection in Settings");
  }

  return { success: true };
}

export async function saveEmailSettings({
  gmail_user,
  email_subject,
  email_intro,
}: {
  gmail_user?: string;
  email_subject?: string;
  email_intro?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const patch: Record<string, string> = { owner_id: user.id, updated_at: new Date().toISOString() };
  if (gmail_user !== undefined) patch.gmail_user = gmail_user.trim();
  if (email_subject !== undefined) patch.email_subject = email_subject.trim();
  if (email_intro !== undefined) patch.email_intro = email_intro.trim();

  const { error } = await supabase
    .from("app_settings")
    .upsert(patch, { onConflict: "owner_id" });

  if (error) throw new Error(error.message);
}
