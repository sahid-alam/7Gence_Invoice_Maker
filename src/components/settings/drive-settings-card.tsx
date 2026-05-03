"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { disconnectGoogleDrive } from "@/actions/integrations";
import { useRouter } from "next/navigation";

export function DriveSettingsCard({ connected }: { connected: boolean }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const router = useRouter();

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectGoogleDrive();
      toast.success("Google Drive disconnected");
      router.refresh();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Export invoices and receipts as PDFs directly to your Google Drive.
          {!connected && " You'll be asked to authorize once."}
        </p>
        {connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 size={16} />
              Connected
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : (
          <Button asChild size="sm">
            <a href="/api/oauth/google">Connect Google Drive</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
