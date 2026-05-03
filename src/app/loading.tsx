import Image from "next/image";

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden">

      {/* Ambient teal glow behind logo */}
      <div
        className="absolute w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(62,204,192,0.18) 0%, rgba(62,204,192,0.06) 45%, transparent 70%)",
          filter: "blur(32px)",
        }}
      />

      {/* Logo + spinning ring */}
      <div className="splash-logo relative flex items-center justify-center w-24 h-24">
        {/* Outer spinning arc */}
        <svg
          className="splash-ring absolute inset-0"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="48" cy="48" r="44" stroke="rgba(62,204,192,0.12)" strokeWidth="2" />
          <path
            d="M48 4 A44 44 0 0 1 92 48"
            stroke="#3eccc0"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M92 48 A44 44 0 0 1 72 84"
            stroke="#3eccc0"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.35"
          />
        </svg>

        {/* Inner ring — counter-spin at half speed */}
        <svg
          className="absolute inset-0"
          style={{ animation: "splashRingSpin 2.2s linear infinite reverse" }}
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M48 14 A34 34 0 0 1 82 48"
            stroke="rgba(80,188,216,0.5)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Logo */}
        <Image
          src="/logo/7gence-logo.svg"
          alt="7Gence"
          width={40}
          height={40}
          className="brightness-0 invert relative z-10"
          priority
        />
      </div>

      {/* Brand text */}
      <div className="mt-7 flex flex-col items-center gap-1">
        <p className="splash-text text-white font-bold text-xl tracking-tight">
          7Gence
        </p>
        <p
          className="splash-sub text-sm tracking-widest uppercase"
          style={{ color: "rgba(255,255,255,0.32)", letterSpacing: "0.22em" }}
        >
          Invoice Maker
        </p>
      </div>

      {/* Progress shimmer bar */}
      <div className="splash-bar mt-10 w-36 h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="splash-bar-inner h-full w-1/3 rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, #3eccc0, #50bcd8, transparent)" }}
        />
      </div>
    </div>
  );
}
