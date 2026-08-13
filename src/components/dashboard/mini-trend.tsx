"use client";

import { GrowBar, CountUp } from "@/components/motion/primitives";

/**
 * Six months of settled income, at a glance.
 *
 * Hand-written bars rather than a chart library: six rectangles don't justify a
 * dependency, and this way the hero card stays cheap. One series, so one hue and no
 * legend — the axis labels carry the months and the tooltip carries the figures.
 *
 * The scale is the tallest month, and that is stated on the card. A bar chart whose
 * baseline isn't zero is the classic way to mislead with a true number, so the bars
 * start at zero and only the top of the range floats.
 */
export function MiniTrend({
  months, amount, symbol,
}: {
  months: { label: string; value: number }[];
  amount: number;
  symbol: string;
}) {
  const peak = Math.max(...months.map((m) => m.value), 1);

  return (
    <div>
      <CountUp
        value={amount}
        prefix={symbol}
        decimals={2}
        className="text-4xl font-bold tracking-tight text-green-600"
      />

      {months.some((m) => m.value > 0) && (
        <div className="mt-4">
          {/* The bars are direct flex children on purpose: a percentage height only
              resolves against a parent with a definite height, and `items-end` is
              what anchors them to a zero baseline. */}
          <div className="flex h-12 items-end gap-1.5">
            {months.map((m, i) => (
              <GrowBar
                key={m.label}
                pct={(m.value / peak) * 100}
                delay={0.15 + i * 0.06}
                title={`${m.label}: ${symbol}${Math.round(m.value).toLocaleString("en-IN")}`}
                // Rounded at the data end only, square on the baseline — and an
                // explicit radius, because `rounded-sm` here derives from the app's
                // --radius (6px) and reads as a blob on a bar this thin.
                className={`flex-1 rounded-t-[3px] ${
                  m.value === peak ? "bg-green-600" : "bg-green-600/35"
                }`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {months.map((m) => (
              <span key={m.label} className="flex-1 text-center text-[10px] text-muted-foreground">
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
