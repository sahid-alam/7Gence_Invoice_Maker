import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profile_id");
  if (!profileId) return NextResponse.json([]);

  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("id, label, type, is_default")
    .eq("business_profile_id", profileId)
    .order("is_default", { ascending: false });

  return NextResponse.json(data ?? []);
}
