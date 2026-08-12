import { createClient } from "@/lib/supabase/server";
import { getMember } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profile_id");
  if (!profileId) return NextResponse.json([]);

  // getMember() rather than auth.getUser(): this fires on every profile switch in
  // the invoice form, and getUser() is a 200-560ms round trip each time.
  const member = await getMember();
  if (!member) return NextResponse.json([], { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("id, label, type, is_default")
    .eq("org_id", member.orgId)
    .eq("business_profile_id", profileId)
    .order("is_default", { ascending: false });

  return NextResponse.json(data ?? []);
}
