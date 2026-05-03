"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveEmailSettings } from "@/actions/email";

interface Props {
  defaultGmailUser: string;
  isConfigured: boolean;
}

export function EmailSettingsForm({ defaultGmailUser, isConfigured }: Props) {
  const [gmailUser, setGmailUser] = useState(defaultGmailUser);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveEmailSettings({ gmail_user: gmailUser });
      toast.success("Gmail address updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gmail-user">Send emails from</Label>
        <Input
          id="gmail-user"
          type="email"
          placeholder="developer7gence@gmail.com"
          value={gmailUser}
          onChange={(e) => setGmailUser(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          {isConfigured
            ? "Auto-filled from your connected Google account. Change only if needed."
            : "Connect Google above — your Gmail address will be filled automatically."}
        </p>
      </div>
      <Button type="submit" disabled={saving || !isConfigured} size="sm">
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
