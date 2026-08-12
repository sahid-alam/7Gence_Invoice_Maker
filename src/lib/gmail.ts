import nodemailer from "nodemailer";
import type { createClient } from "@/lib/supabase/server";
import { encryptToken, decryptToken } from "@/lib/token-crypto";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A nodemailer transport for the organization's connected Gmail account.
 *
 * Extracted so invoice email and member invites share one implementation. Two
 * copies would mean two places refreshing the same OAuth token, which can race:
 * whichever writes last wins and the other's access token is already stale.
 *
 * Throws with an actionable message rather than returning null — every caller
 * wants to tell the user what to reconnect.
 */
export async function getGmailTransport(supabase: Supabase, orgId: string) {
  const [tokenRes, settingsRes] = await Promise.all([
    supabase
      .from("oauth_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("org_id", orgId)
      .eq("provider", "google_drive")
      .single(),
    supabase.from("app_settings").select("gmail_user").eq("org_id", orgId).single(),
  ]);

  if (!tokenRes.data) {
    throw new Error("Google account not connected — go to Settings to connect Google");
  }
  const gmailUser = settingsRes.data?.gmail_user;
  if (!gmailUser) {
    throw new Error("Gmail address not found — reconnect Google in Settings");
  }

  let accessToken = decryptToken(tokenRes.data.access_token);
  const refreshTokenRaw = tokenRes.data.refresh_token
    ? decryptToken(tokenRes.data.refresh_token)
    : null;

  // Refresh a minute before expiry, not at it — a token that dies mid-send fails
  // the whole email.
  if (tokenRes.data.expires_at && new Date(tokenRes.data.expires_at) <= new Date(Date.now() + 60_000)) {
    if (!refreshTokenRaw) throw new Error("Google token expired — reconnect in Settings");

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshTokenRaw,
        grant_type: "refresh_token",
      }),
    });
    if (!refreshRes.ok) throw new Error("Failed to refresh Google token — reconnect in Settings");

    const refreshed = (await refreshRes.json()) as { access_token: string; expires_in: number };
    accessToken = refreshed.access_token;
    await supabase
      .from("oauth_tokens")
      .update({
        access_token: encryptToken(accessToken),
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("org_id", orgId)
      .eq("provider", "google_drive");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: gmailUser,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: refreshTokenRaw ?? undefined,
      accessToken,
    },
  });

  return { transporter, gmailUser };
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
