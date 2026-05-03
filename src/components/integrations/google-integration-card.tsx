"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, HardDrive, Mail } from "lucide-react";
import { disconnectGoogleDrive } from "@/actions/integrations";
import { saveEmailSettings } from "@/actions/email";
import { useRouter } from "next/navigation";

const DEFAULT_SUBJECT = "Invoice {{invoice_number}} — {{amount}} due";
const DEFAULT_INTRO = "Please find your invoice details below.";

interface Props {
  connected: boolean;
  gmailUser: string;
  emailSubject: string;
  emailIntro: string;
}

export function GoogleIntegrationCard({ connected, gmailUser, emailSubject, emailIntro }: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [senderAddress, setSenderAddress] = useState(gmailUser);
  const [savingAddress, setSavingAddress] = useState(false);
  const [subject, setSubject] = useState(emailSubject || DEFAULT_SUBJECT);
  const [intro, setIntro] = useState(emailIntro || DEFAULT_INTRO);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const router = useRouter();

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectGoogleDrive();
      toast.success("Google disconnected");
      router.refresh();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    setSavingAddress(true);
    try {
      await saveEmailSettings({ gmail_user: senderAddress });
      toast.success("Sender address updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      await saveEmailSettings({ email_subject: subject, email_intro: intro });
      toast.success("Email template saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {/* Google G logo */}
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <div className="flex flex-col gap-1.5 mt-0.5">
            <span className="flex items-center gap-1.5"><HardDrive size={13} /> Drive export — save invoice &amp; receipt PDFs to Google Drive</span>
            <span className="flex items-center gap-1.5"><Mail size={13} /> Gmail sending — email invoices to clients directly</span>
          </div>
        </div>

        <Separator />

        {connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle2 size={15} />
                Connected{gmailUser ? ` as ${gmailUser}` : ""}
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

            <form onSubmit={handleSaveAddress} className="space-y-2">
              <Label htmlFor="sender-address" className="text-xs text-muted-foreground">
                Send emails from
              </Label>
              <div className="flex gap-2">
                <Input
                  id="sender-address"
                  type="email"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  className="h-8 text-sm"
                  required
                />
                <Button type="submit" size="sm" variant="outline" disabled={savingAddress}>
                  {savingAddress ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>

            <Separator />

            <form onSubmit={handleSaveTemplate} className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-0.5">Email template</p>
                <p className="text-xs text-muted-foreground">
                  Customise the subject and opening message. Available variables:{" "}
                  {["{{client_name}}", "{{invoice_number}}", "{{amount}}", "{{due_date}}"].map((v) => (
                    <code
                      key={v}
                      className="mx-0.5 px-1 py-0.5 rounded bg-muted text-[11px] font-mono cursor-pointer select-all"
                      title="Click to copy"
                      onClick={() => navigator.clipboard.writeText(v)}
                    >
                      {v}
                    </code>
                  ))}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-subject" className="text-xs text-muted-foreground">
                  Subject
                </Label>
                <Input
                  id="email-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-8 text-sm"
                  placeholder={DEFAULT_SUBJECT}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-intro" className="text-xs text-muted-foreground">
                  Opening message
                </Label>
                <textarea
                  id="email-intro"
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  rows={3}
                  placeholder={DEFAULT_INTRO}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  required
                />
              </div>

              <Button type="submit" size="sm" variant="outline" disabled={savingTemplate}>
                {savingTemplate ? "Saving…" : "Save template"}
              </Button>
            </form>
          </div>
        ) : (
          <Button asChild size="sm">
            <a href="/api/oauth/google">Connect Google</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
