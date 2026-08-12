"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

/**
 * Set a new password. Serves two arrivals with the same code:
 *
 *  - from a reset email, where the callback has already exchanged the recovery
 *    code for a session, so the user is authenticated;
 *  - from Settings while signed in, as an ordinary password change.
 *
 * Deliberately outside the (app) route group. That layout requires an organization
 * membership, and someone who cannot sign in should still be able to reset their
 * password — being locked out of an org is not a reason to be locked out of your
 * own account. Middleware still requires a session, which both arrivals have.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use at least 8 characters");
    if (password !== confirm) return toast.error("The two passwords don't match");

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(
        /session|token|expired/i.test(error.message)
          ? "That reset link has expired — request a new one"
          : error.message
      );
      return;
    }
    toast.success("Password updated");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-panel">
        <KeyRound size={20} className="mb-3 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          At least 8 characters. You&apos;ll stay signed in on this device.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Update password"}
          </Button>
        </form>

        <Link
          href="/settings"
          className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
