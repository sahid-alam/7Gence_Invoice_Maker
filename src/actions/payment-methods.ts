"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { parseWiseDetails } from "@/lib/wise";

export async function createPaymentMethod(profileId: string, formData: FormData) {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("org_id", member.orgId)
    .single();
  if (!profile) throw new Error("Profile not found");

  const type = formData.get("type") as string;

  // Wise: parse the pasted block server-side rather than trusting the client's preview.
  const wise = type === "wise" ? parseWiseDetails(formData.get("wise_paste") as string || "") : null;
  // No beneficiary name means an invoice listing an account with nobody's name on it —
  // the wire gets rejected and the FIRC won't reconcile. Refuse rather than save it.
  if (wise && (!wise.name || wise.fields.length === 0)) {
    throw new Error("Couldn't find a beneficiary name and account details — paste the whole block from Wise.");
  }

  const data = {
    owner_id: member.id,
    org_id: member.orgId,
    business_profile_id: profileId,
    type,
    label: formData.get("label") as string,
    is_default: formData.get("is_default") === "on",
    details: wise?.fields ?? null,
    // bank (also holds the Wise beneficiary name — it must match your GST-registered legal name)
    account_holder_name: wise?.name ?? (formData.get("account_holder_name") as string || null),
    bank_name: formData.get("bank_name") as string || null,
    account_number: formData.get("account_number") as string || null,
    ifsc_code: formData.get("ifsc_code") as string || null,
    swift_code: formData.get("swift_code") as string || null,
    // crypto
    wallet_address: formData.get("wallet_address") as string || null,
    network: formData.get("network") as string || null,
    coin: formData.get("coin") as string || null,
    account_name: formData.get("account_name") as string || null,
    // upi
    upi_id: formData.get("upi_id") as string || null,
  };

  const { error } = await supabase.from("payment_methods").insert(data);
  if (error) throw new Error(error.message);

  revalidatePath(`/profiles/${profileId}`);
}

export async function deletePaymentMethod(id: string, profileId: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);
  revalidatePath(`/profiles/${profileId}`);
}
