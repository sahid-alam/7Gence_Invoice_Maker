"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const router   = useRouter();
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
    /* Always dark — hardcoded colors, ignores app theme */
    <div className="min-h-screen flex relative bg-black overflow-hidden">

      {/* ── Gradient layer ────────────────────────────────────────────
          70% from right edge so it bleeds into the left panel,
          creating seamless invisible division.                        */}
      <div className="hidden lg:block absolute bottom-0 right-0 w-[70%] pointer-events-none z-0" style={{ top: "-30%" }}>
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Vertical-streak displacement — replicates Fractal Maze look (Image #3)
                Very low Y freq → tall vertical cells → streak curtains             */}
            <filter
              id="streaks"
              x="-25%" y="-25%"
              width="150%" height="150%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="turbulence"
                baseFrequency="0.013 0.0015"
                numOctaves="3"
                seed="9"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="130"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>

            {/* Primary teal/cyan glow at top-right
                (Image #4 flipped: bright area moved to top)           */}
            <radialGradient id="g-primary" cx="0.92" cy="0.22" r="0.74">
              <stop offset="0%"   stopColor="#c0fff5" stopOpacity="0.88" />
              <stop offset="14%"  stopColor="#3eccc0" stopOpacity="0.68" />
              <stop offset="40%"  stopColor="#04547e" stopOpacity="0.28" />
              <stop offset="70%"  stopColor="#01090f" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0"   />
            </radialGradient>

            {/* Deep blue secondary glow at bottom-right — smooth (no streaks) */}
            <radialGradient id="g-secondary" cx="1" cy="0.9" r="0.52">
              <stop offset="0%"   stopColor="#50bcd8" stopOpacity="0.42" />
              <stop offset="38%"  stopColor="#021b38" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0"   />
            </radialGradient>
          </defs>

          {/* Smooth secondary glow */}
          <rect width="100%" height="100%" fill="url(#g-secondary)" />
          {/* Primary glow with vertical streak displacement */}
          <rect width="100%" height="100%" fill="url(#g-primary)" filter="url(#streaks)" />
        </svg>

        {/* Grain overlay */}
        <div className="noise-overlay absolute inset-0" />
      </div>

      {/* ── Left panel — branding (Image #2 layout, minimal) ────── */}
      <div className="hidden lg:flex flex-[5] flex-col justify-between p-12 relative z-10">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo/7gence-logo.svg"
            alt="7Gence"
            width={38}
            height={38}
            className="brightness-0 invert"
            priority
          />
          <div>
            <p className="font-bold text-white text-sm tracking-tight leading-tight">7Gence</p>
            <p className="text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.32)" }}>
              Invoice Maker
            </p>
          </div>
        </div>

        {/* Tagline — matches Image #2 exactly */}
        <div className="space-y-1">
          <p className="text-2xl font-light" style={{ color: "rgba(255,255,255,0.42)" }}>
            Professional invoices.
          </p>
          <p className="text-2xl font-bold text-white">Zero friction.</p>
          <p className="text-sm mt-3" style={{ color: "rgba(255,255,255,0.28)" }}>
            GST-ready · Multi-currency · PDF export
          </p>
        </div>

        {/* Copyright */}
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.18)" }}>
          © 2026 7Gence. All rights reserved.
        </p>
      </div>

      {/* ── Right panel — login form ────────────────────────────── */}
      <div className="flex-[3] flex items-center justify-center p-10 relative z-10">
        <div className="w-full max-w-[280px] space-y-7 animate-fade-in">

          {/* Mobile-only logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/logo/7gence-logo.svg"
              alt="7Gence"
              width={32}
              height={32}
              className="brightness-0 invert"
            />
            <div>
              <p className="font-bold text-white text-sm tracking-tight">7Gence</p>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Invoice Maker</p>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white tracking-tight">Sign in</h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.38)" }}>
              Access your workspace
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" style={{ color: "rgba(255,255,255,0.55)" }} className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="developer7gence@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/20 focus-visible:ring-white/20 focus-visible:border-white/22 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" style={{ color: "rgba(255,255,255,0.55)" }} className="text-xs">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/20 focus-visible:ring-white/20 focus-visible:border-white/22 text-sm"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black hover:bg-white/90 font-semibold text-sm transition-all"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>

    </div>
  );
}
