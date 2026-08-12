import { createClient } from "@/lib/supabase/server";
import { getMember } from "@/lib/auth";

export type InvoiceEventType =
  | "created"
  | "edited"
  | "sent"
  | "unsent"
  | "voided"
  | "emailed"
  | "payment_recorded"
  | "payment_deleted"
  | "settled"
  | "exported_to_drive"
  | "removed_from_drive";

export interface InvoiceEvent {
  id: string;
  type: InvoiceEventType | string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Append one entry to an invoice's activity trail.
 *
 * Deliberately never throws. A failure to write history must not roll back the
 * business action that succeeded — an invoice that saved but wasn't logged is
 * far better than one that refused to save because logging broke. The trade-off
 * is that the trail can have gaps; it is a record, not a ledger of authority.
 *
 * Attribution: `owner_id` on each event is the member who acted — it is the
 * created_by of this table, not a tenancy key (that is `org_id`). The activity
 * rail resolves it to a name so the trail can say "Anas sent this".
 */
export async function logInvoiceEvent(
  invoiceId: string,
  type: InvoiceEventType,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const member = await getMember();
    if (!member) return;
    const supabase = await createClient();

    await supabase.from("invoice_events").insert({
      owner_id: member.id,
      org_id: member.orgId,
      invoice_id: invoiceId,
      type,
      // Who acted is recorded ON the event rather than joined at read time.
      // auth.users isn't exposed through the API, and a snapshot is the more
      // correct answer for a trail anyway: it says who it was at the time, and
      // stays true if that person later changes their address or leaves.
      detail: { ...(detail ?? {}), by: member.email },
    });
  } catch (err) {
    console.error("invoice_events: could not record", type, err);
  }
}

/** Same, for one action touching several invoices (a split payment). */
export async function logInvoiceEvents(
  invoiceIds: string[],
  type: InvoiceEventType,
  detail?: Record<string, unknown>
): Promise<void> {
  await Promise.all(invoiceIds.map((id) => logInvoiceEvent(id, type, detail)));
}
