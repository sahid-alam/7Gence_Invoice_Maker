import { createClient } from "@/lib/supabase/server";
import { GoogleIntegrationCard } from "@/components/integrations/google-integration-card";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = await createClient();

  const [driveTokenRes, settingsRes] = await Promise.all([
    supabase
      .from("oauth_tokens")
      .select("id")
      .eq("provider", "google_drive")
      .single(),
    supabase
      .from("app_settings")
      .select("gmail_user, email_subject, email_intro")
      .single(),
  ]);

  const driveConnected = !!driveTokenRes.data;
  const gmailUser = settingsRes.data?.gmail_user ?? "";
  const emailSubject = settingsRes.data?.email_subject ?? "";
  const emailIntro = settingsRes.data?.email_intro ?? "";

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
        <p className="text-muted-foreground">Connect external services</p>
      </div>

      {connected === "google_drive" && (
        <div className="rounded-md bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm">
          Google connected — Drive export and Gmail sending are now active.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error === "google_not_configured" && "Google OAuth credentials are not set up on the server. See the setup guide."}
          {error === "google_oauth_denied" && "Google access was denied."}
          {error === "google_oauth_invalid_state" && "OAuth state mismatch — please try connecting again."}
          {error === "google_token_exchange_failed" && "Failed to exchange Google auth code for tokens."}
          {error === "google_token_save_failed" && "Failed to save Google tokens."}
          {!["google_not_configured", "google_oauth_denied", "google_oauth_invalid_state", "google_token_exchange_failed", "google_token_save_failed"].includes(error) && "An error occurred."}
        </div>
      )}

      <GoogleIntegrationCard
        connected={driveConnected}
        gmailUser={gmailUser}
        emailSubject={emailSubject}
        emailIntro={emailIntro}
      />
    </div>
  );
}
