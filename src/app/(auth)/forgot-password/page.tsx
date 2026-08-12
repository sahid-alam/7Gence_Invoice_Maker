"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setProblem(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // The link lands on the callback, which exchanges the code for a session
      // and then forwards to the page where the new password is actually set.
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    // Deliberately shown even on error: telling a stranger whether an address has
    // an account here is an account-enumeration leak. Real failures are surfaced
    // only when they are about sending, not about whether the account exists.
    if (error && /rate|limit|smtp|email/i.test(error.message)) setProblem(error.message);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
      <div className="w-full max-w-sm">
        <Image
          src="/logo/7gence-logo.svg"
          alt="7Gence"
          width={40}
          height={40}
          className="mb-6 brightness-0 invert"
        />

        {sent ? (
          <>
            <MailCheck size={24} className="mb-3 text-green-400" />
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-white/60">
              If <span className="text-white/90">{email}</span> has an account, a reset
              link is on its way. It expires in an hour.
            </p>
            {problem && (
              <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                The mail server reported: {problem}. If nothing arrives, an owner can
                set a new password for you from Settings.
              </p>
            )}
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Reset your password</h1>
            <p className="mt-2 text-sm text-white/60">
              We&apos;ll email you a link to set a new one.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-white/55">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
