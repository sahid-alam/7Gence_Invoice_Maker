"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = {
    owner_id: user.id,
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
  redirect(`/profiles/${profile.id}`);
}

export async function updateProfile(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath(`/profiles/${id}`);
  revalidatePath("/profiles");
}

export async function deleteProfile(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("business_profiles")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/profiles");
  redirect("/profiles");
}
