"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createClient_action(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = {
    owner_id: user.id,
    name: formData.get("name") as string,
    company_name: formData.get("company_name") as string || null,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    address_line1: formData.get("address_line1") as string || null,
    address_line2: formData.get("address_line2") as string || null,
    city: formData.get("city") as string || null,
    state: formData.get("state") as string || null,
    country: formData.get("country") as string || null,
    postal_code: formData.get("postal_code") as string || null,
    gstin: formData.get("gstin") as string || null,
    notes: formData.get("notes") as string || null,
  };

  const { data: client, error } = await supabase
    .from("clients")
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = {
    name: formData.get("name") as string,
    company_name: formData.get("company_name") as string || null,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    address_line1: formData.get("address_line1") as string || null,
    address_line2: formData.get("address_line2") as string || null,
    city: formData.get("city") as string || null,
    state: formData.get("state") as string || null,
    country: formData.get("country") as string || null,
    postal_code: formData.get("postal_code") as string || null,
    gstin: formData.get("gstin") as string || null,
    notes: formData.get("notes") as string || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("clients")
    .update(data)
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function deleteClientAction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/clients");
  redirect("/clients");
}
