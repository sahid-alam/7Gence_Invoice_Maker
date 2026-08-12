import { formatCurrency } from "@/lib/currency";
import type { MonthBucket } from "@/lib/fy-report";

/**
 * Twelve months of settled INR, as columns.
 *
 * Single series, so one hue and no legend — the heading already says what is
 * plotted, and a one-swatch legend box would only restate it. #16a34a is the
 * app's money-in green and is the one step that clears the validator's lightness
 * band in BOTH themes (0.43–0.77 light, 0.48–0.67 dark), so both modes share it.
 *
 * Hand-drawn SVG rather than a chart library: twelve rectangles do not justify a
 * dependency, and it keeps the page a server component with no client JS.
 */
const SERIES = "#16a34a";

export function MonthlyEarningsChart({
  months,
  peak,
  currency,
}: {
  months: MonthBucket[];
  peak: MonthBucket | null;
  currency: string;
}) {
  const max = Math.max(...months.map((m) => m.earned), 0);

  if (max === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          Nothing settled in this year yet.
        </p>
      </div>
    );
  }

  // Round the top gridline up to something readable rather than the raw maximum.
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;

  const H = 180;      // plot height in px
  const BAR_MAX = 24; // never let a column fill its slot — the leftover is air

  return (
    <figure className="m-0">
      <div className="flex gap-3">
        {/* Y axis: ticks carry the values no column is directly labelled with. */}
        <div
          className="flex w-16 shrink-0 flex-col justify-between py-0 text-right text-[10px] tabular-nums text-muted-foreground"
          style={{ height: H }}
          aria-hidden
        >
          <span>{compact(top, currency)}</span>
          <span>{compact(top / 2, currency)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: H }}>
            {/* Hairline gridlines, one step off the surface, never dashed. */}
            {[0, 0.5, 1].map((f) => (
              <div
                key={f}
                className="absolute inset-x-0 border-t border-border"
                style={{ top: `${f * 100}%` }}
                aria-hidden
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {months.map((m) => {
                const h = m.earned === 0 ? 0 : Math.max(2, (m.earned / top) * H);
                const isPeak = peak?.key === m.key;
                return (
                  <div key={m.key} className="group relative flex flex-1 justify-center">
                    <div
                      className="w-full transition-opacity"
                      style={{
                        maxWidth: BAR_MAX,
                        height: h,
                        background: SERIES,
                        // Rounded at the data end, square where it meets the baseline.
                        borderRadius: "4px 4px 0 0",
                        opacity: m.earned === 0 ? 0.18 : 1,
                      }}
                    />
                    {/* Per-column tooltip: the values not directly labelled still
                        have to be reachable without leaving the page. */}
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-pop group-hover:block"
                    >
                      <span className="font-medium">{m.label}</span>{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(m.earned, currency)}
                      </span>
                    </div>
                    {/* Exactly one direct label — the peak. A number on every column
                        is noise and goes unread. */}
                    {isPeak && m.earned > 0 && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-foreground"
                        style={{ bottom: h + 4 }}
                      >
                        {compact(m.earned, currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-1.5 flex gap-[2px]">
            {months.map((m) => (
              <span
                key={m.key}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The table view: everything the chart shows, reachable without colour or hover. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Show as table
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Month</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {months.map((m) => (
                <tr key={m.key}>
                  <td className="px-3 py-1.5">{m.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatCurrency(m.earned, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** ₹1.2L / ₹95k — axis ticks need to be short, not exact. */
function compact(n: number, currency: string) {
  if (n === 0) return "0";
  if (currency === "INR") {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000) return `₹${Math.round(n / 1_000)}k`;
    return `₹${Math.round(n)}`;
  }
  return formatCurrency(n, currency);
}
