"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function SplashOverlay() {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");

  useEffect(() => {
    const content = document.getElementById("page-content");

    // Only show on the login page — inside the app use skeleton loaders
    if (window.location.pathname !== "/login") {
      setPhase("done");
      return;
    }

    // Keep page content invisible while splash is showing
    if (content) content.style.opacity = "0";

    const holdTimer = setTimeout(() => {
      setPhase("fading");
      // Fade content in at the same time as splash fades out
      if (content) {
        content.style.transition = "opacity 600ms ease-in-out";
        content.style.opacity = "1";
      }
    }, 2800);

    const removeTimer = setTimeout(() => {
      setPhase("done");
      if (content) content.style.transition = "";
    }, 3400);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black overflow-hidden"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        transition: phase === "fading" ? "opacity 600ms ease-in-out" : undefined,
        pointerEvents: phase === "fading" ? "none" : undefined,
      }}
    >
      {/* Same teal gradient as auth page */}
      <div
        className="absolute bottom-0 right-0 w-[70%] pointer-events-none"
        style={{ top: "-30%" }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="sp-streaks" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
              <feTurbulence type="turbulence" baseFrequency="0.013 0.0015" numOctaves="3" seed="9" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="130" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <radialGradient id="sp-primary" cx="0.92" cy="0.22" r="0.74">
              <stop offset="0%"   stopColor="#c0fff5" stopOpacity="0.88" />
              <stop offset="14%"  stopColor="#3eccc0" stopOpacity="0.68" />
              <stop offset="40%"  stopColor="#04547e" stopOpacity="0.28" />
              <stop offset="70%"  stopColor="#01090f" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0"   />
            </radialGradient>
            <radialGradient id="sp-secondary" cx="1" cy="0.9" r="0.52">
              <stop offset="0%"   stopColor="#50bcd8" stopOpacity="0.42" />
              <stop offset="38%"  stopColor="#021b38" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0"   />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#sp-secondary)" />
          <rect width="100%" height="100%" fill="url(#sp-primary)" filter="url(#sp-streaks)" />
        </svg>
        <div className="noise-overlay absolute inset-0" />
      </div>

      {/* Centered content */}
      <div className="relative z-10 flex flex-col items-center" style={{ gap: "28px" }}>

        <div className="splash-logo flex items-center gap-3">
          <Image
            src="/logo/7gence-logo.svg"
            alt="7Gence"
            width={46}
            height={46}
            className="brightness-0 invert"
            priority
          />
          <div>
            <p className="font-bold text-white leading-tight" style={{ fontSize: "18px", letterSpacing: "-0.01em" }}>
              7Gence
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)", letterSpacing: "0.18em" }}>
              INVOICE MAKER
            </p>
          </div>
        </div>

        <div className="splash-text text-center" style={{ lineHeight: 1.35 }}>
          <p style={{ fontSize: "22px", fontWeight: 300, color: "rgba(255,255,255,0.42)" }}>
            Professional invoices.
          </p>
          <p style={{ fontSize: "22px", fontWeight: 700, color: "#ffffff" }}>
            Zero friction.
          </p>
        </div>

        <div
          className="splash-bar w-28 rounded-full overflow-hidden"
          style={{ height: "1px", background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="splash-bar-inner h-full w-1/3 rounded-full"
            style={{ background: "linear-gradient(90deg, transparent, #3eccc0, #50bcd8, transparent)" }}
          />
        </div>
      </div>
    </div>
  );
}
