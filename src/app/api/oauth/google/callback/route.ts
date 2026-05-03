import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateParam = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!stateParam || !storedState || stateParam !== storedState) {
    redirect("/settings?error=google_oauth_invalid_state");
  }

  if (error || !code) {
    redirect("/settings?error=google_oauth_denied");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code!,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/oauth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    redirect("/settings?error=google_token_exchange_failed");
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Fetch the user's Gmail address so email sending needs zero manual config
  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userinfo = userinfoRes.ok
    ? (await userinfoRes.json() as { email?: string })
    : { email: undefined };

  const { error: upsertError } = await supabase
    .from("oauth_tokens")
    .upsert(
      {
        owner_id: user.id,
        provider: "google_drive",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        scope: tokens.scope,
      },
      { onConflict: "owner_id,provider" }
    );

  if (upsertError) {
    redirect("/settings?error=google_token_save_failed");
  }

  // Auto-save the Gmail address so email works immediately after connecting
  if (userinfo.email) {
    await supabase
      .from("app_settings")
      .upsert(
        { owner_id: user.id, gmail_user: userinfo.email, updated_at: new Date().toISOString() },
        { onConflict: "owner_id" }
      );
  }

  redirect("/integrations?connected=google_drive");
}
