"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { logInvoiceEvent } from "@/lib/invoice-events";
import { formatCurrency } from "@/lib/currency";
import { getGmailTransport } from "@/lib/gmail";
import { UserFacingError, asResult, type ActionResult } from "@/lib/errors";
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

export async function sendInvoiceEmail(
  invoiceId: string
): Promise<ActionResult<{ sentTo: string }>> {
  // Returned, not thrown — see lib/errors.ts. Emailing an invoice is the app's
  // core job, and "reconnect Google in Settings" is useless if production
  // replaces it with a digest.
  return asResult(() => sendInvoiceEmailBody(invoiceId), "Could not send the invoice");
}

async function sendInvoiceEmailBody(invoiceId: string): Promise<{ sentTo: string }> {
  const member = await requireMember();
  const supabase = await createClient();

  const [invoiceRes, itemsRes, tokenRes, settingsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, business_profiles(display_name, email, phone, address_line1, city, state, country, gstin, logo_url)")
      .eq("id", invoiceId)
      .eq("org_id", member.orgId)
      .single(),
    supabase
      .from("invoice_items")
      .select("description, quantity, unit_price")
      .eq("invoice_id", invoiceId)
      .eq("org_id", member.orgId)
      .order("sort_order"),
    supabase
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("org_id", member.orgId)
      .eq("provider", "google_drive")
      .single(),
    supabase
      .from("app_settings")
      .select("gmail_user, email_subject, email_intro")
      .eq("org_id", member.orgId)
      .single(),
  ]);

  if (!invoiceRes.data) throw new UserFacingError("Invoice not found");
  if (!invoiceRes.data.client_email) throw new UserFacingError("No client email on this invoice — add one and try again");

  if (!tokenRes.data) {
    throw new UserFacingError("Google account not connected — go to Settings to connect Google");
  }

  const gmailUser = settingsRes.data?.gmail_user;
  if (!gmailUser) {
    throw new UserFacingError("Gmail address not found — reconnect Google in Settings");
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

  // Shared with member invites — see lib/gmail.ts for why this is not inlined.
  const { transporter } = await getGmailTransport(supabase, member.orgId);

  // Generate PDF attachment
  registerFonts();
  const invoiceWithItems = { ...invoice, items: itemsRes.data ?? [] };
  const Template = invoice.template_id === "cream-serif" ? TemplateCreamSerif : TemplateWhiteCaps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(Template, { invoice: invoiceWithItems }) as any);

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
    throw new UserFacingError(
      err instanceof Error
        ? err.message
        : "Failed to send email — check your Google connection in Settings"
    );
  }

  await logInvoiceEvent(invoiceId, "emailed", { to: invoice.client_email });

  return { sentTo: invoice.client_email };
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
  const member = await requireMember();
  const supabase = await createClient();

  const patch: Record<string, string> = {
    owner_id: member.id,
    org_id: member.orgId,
    updated_at: new Date().toISOString(),
  };
  if (gmail_user !== undefined) patch.gmail_user = gmail_user.trim();
  if (email_subject !== undefined) patch.email_subject = email_subject.trim();
  if (email_intro !== undefined) patch.email_intro = email_intro.trim();

  const { error } = await supabase
    .from("app_settings")
    .upsert(patch, { onConflict: "org_id" });

  if (error) throw new Error(error.message);
}
