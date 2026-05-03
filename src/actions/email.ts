"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";
import { formatCurrency } from "@/lib/currency";

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

  const [invoiceRes, tokenRes, settingsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, client_email, total, currency, due_date")
      .eq("id", invoiceId)
      .eq("owner_id", user.id)
      .single(),
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
  const introTemplate = settingsRes.data?.email_intro?.trim() || "Please find your invoice details below.";
  const emailSubject = applyVars(subjectTemplate);
  const emailIntro = applyVars(introTemplate);

  let { access_token } = tokenRes.data;

  // Refresh token if expired
  if (tokenRes.data.expires_at && new Date(tokenRes.data.expires_at) <= new Date(Date.now() + 60_000)) {
    if (!tokenRes.data.refresh_token) {
      throw new Error("Google token expired — reconnect in Settings");
    }
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenRes.data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    if (!refreshRes.ok) throw new Error("Failed to refresh Google token — reconnect in Settings");
    const refreshed = await refreshRes.json() as { access_token: string; expires_in: number };
    access_token = refreshed.access_token;
    await supabase
      .from("oauth_tokens")
      .update({ access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
      .eq("owner_id", user.id)
      .eq("provider", "google_drive");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: gmailUser,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: tokenRes.data.refresh_token ?? undefined,
      accessToken: access_token,
    },
  });

  const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/invoices/${invoiceId}/pdf`;

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
      <a href="${pdfUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; margin-top: 8px;">
        Download Invoice PDF
      </a>
      <p style="margin-top: 32px; font-size: 13px; color: #999;">
        This email was sent by 7Gence Invoice Maker. Please reply to this email if you have any questions.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `7Gence <${gmailUser}>`,
    to: invoice.client_email,
    subject: emailSubject,
    html,
  });

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
  revalidatePath("/integrations");
}
