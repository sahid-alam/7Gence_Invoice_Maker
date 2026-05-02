"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Invalid email or password");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-sidebar border-r border-border">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/7gence-logo.svg"
            alt="7Gence"
            width={40}
            height={40}
            className="dark:brightness-0 dark:invert"
          />
          <div>
            <p className="font-bold text-sm tracking-tight leading-tight">7Gence</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Invoice Maker</p>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-muted-foreground text-2xl font-light leading-snug">
            Professional invoices.<br />
            <span className="text-foreground font-semibold">Zero friction.</span>
          </p>
          <p className="text-muted-foreground/60 text-sm">
            GST-ready · Multi-currency · PDF export
          </p>
        </div>
        <p className="text-muted-foreground/40 text-xs">© 2026 7Gence. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/logo/7gence-logo.svg"
              alt="7Gence"
              width={36}
              height={36}
              className="dark:brightness-0 dark:invert"
            />
            <div>
              <p className="font-bold text-sm tracking-tight">7Gence</p>
              <p className="text-[10px] text-muted-foreground">Invoice Maker</p>
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-sm">Access your invoice workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="developer7gence@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
