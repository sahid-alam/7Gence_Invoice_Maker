"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";

export async function createProfile(formData: FormData) {
  const member = await requireMember();
  const supabase = await createClient();

  const data = {
    owner_id: member.id,
    org_id: member.orgId,
    display_name: formData.get("display_name") as string,
    legal_name: formData.get("legal_name") as string || null,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    address_line1: formData.get("address_line1") as string || null,
    address_line2: formData.get("address_line2") as string || null,
    city: formData.get("city") as string || null,
    state: formData.get("state") as string || null,
    country: formData.get("country") as string || "IN",
    postal_code: formData.get("postal_code") as string || null,
    gstin: formData.get("gstin") as string || null,
    pan: formData.get("pan") as string || null,
    invoice_prefix: formData.get("invoice_prefix") as string || "7GS",
    default_currency: formData.get("default_currency") as string || "USD",
    default_template_id: formData.get("default_template_id") as string || "white-caps",
  };

  const { data: profile, error } = await supabase
    .from("business_profiles")
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
  redirect(`/profiles/${profile.id}?saved=Profile+created`);
}

export async function updateProfile(id: string, formData: FormData) {
  const member = await requireMember();
  const supabase = await createClient();

  const data = {
    display_name: formData.get("display_name") as string,
    legal_name: formData.get("legal_name") as string || null,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    address_line1: formData.get("address_line1") as string || null,
    address_line2: formData.get("address_line2") as string || null,
    city: formData.get("city") as string || null,
    state: formData.get("state") as string || null,
    country: formData.get("country") as string || "IN",
    postal_code: formData.get("postal_code") as string || null,
    gstin: formData.get("gstin") as string || null,
    pan: formData.get("pan") as string || null,
    invoice_prefix: formData.get("invoice_prefix") as string || "7GS",
    default_currency: formData.get("default_currency") as string || "USD",
    default_template_id: formData.get("default_template_id") as string || "white-caps",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("business_profiles")
    .update(data)
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);

  revalidatePath(`/profiles/${id}`);
  revalidatePath("/profiles");
  redirect(`/profiles/${id}?saved=Changes+saved`);
}

export async function deleteProfile(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  // invoices.business_profile_id and receipts.business_profile_id have no ON DELETE
  // rule, so Postgres would reject this with a raw foreign-key error. Check first and
  // say what to do about it — payment_methods and payments cascade and are fine.
  const [{ count: invoiceCount }, { count: receiptCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("business_profile_id", id)
      .eq("org_id", member.orgId),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("business_profile_id", id)
      .eq("org_id", member.orgId),
  ]);

  const blockers: string[] = [];
  if (invoiceCount) blockers.push(`${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}`);
  if (receiptCount) blockers.push(`${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`);
  if (blockers.length) {
    // Say "delete", not "void". Voiding leaves the row in place, so the foreign key
    // still blocks this — an earlier version of this message suggested voiding and
    // sent people down a dead end.
    throw new Error(
      `This identity still has ${blockers.join(" and ")}. Delete ${blockers.length > 1 ? "them" : "those"} first — voiding isn't enough, the records still exist. Open each one and use Delete from its actions menu.`
    );
  }

  const { error } = await supabase
    .from("business_profiles")
    .delete()
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
  redirect("/profiles?saved=Profile+deleted");
}
