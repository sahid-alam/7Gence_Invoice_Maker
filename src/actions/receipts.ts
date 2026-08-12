"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";

export async function deleteReceiptAction(id: string) {
  const member = await requireMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id)
    .eq("org_id", member.orgId);

  if (error) throw new Error(error.message);
  revalidatePath("/receipts");
  revalidatePath("/dashboard");
  redirect("/receipts");
}
