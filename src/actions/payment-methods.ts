"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPaymentMethod(profileId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("owner_id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");

  const type = formData.get("type") as string;

  const data = {
    owner_id: user.id,
    business_profile_id: profileId,
    type,
    label: formData.get("label") as string,
    is_default: formData.get("is_default") === "on",
    // bank
    account_holder_name: formData.get("account_holder_name") as string || null,
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("payment_methods")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/profiles/${profileId}`);
}
