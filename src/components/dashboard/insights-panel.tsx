"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowUpRight, Clock, FileWarning, TrendingUp, Users,
  Hourglass, Sparkles, Check, type LucideIcon,
} from "lucide-react";
import { Stagger, StaggerItem, Lift } from "@/components/motion/primitives";
import type { Insight, Severity } from "@/lib/insights";

/**
 * What the books noticed.
 *
 * Every line here is arithmetic over the reader's own rows — see `lib/insights.ts`.
 * Each card carries its evidence ("median of 6 paid invoices") because a claim about
 * someone's money should be checkable, and because the evidence line is what makes an
 * empty panel legible: nothing is being hidden, there simply isn't enough history yet.
 */

const TONE: Record<Severity, { ring: string; chip: string; dot: string; label: string }> = {
  attention: {
    ring: "border-amber-300/70 dark:border-amber-700/50",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Needs attention",
  },
  watch: {
    ring: "border-border",
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    dot: "bg-blue-500",
    label: "Worth watching",
  },
  good: {
    ring: "border-green-300/60 dark:border-green-800/50",
    chip: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
    dot: "bg-green-500",
    label: "In your favour",
  },
};

const ICONS: Record<string, LucideIcon> = {
  "overdue-aging": Clock,
  "stuck-drafts": FileWarning,
  "unusual-amount": AlertTriangle,
  concentration: Users,
  "slowest-payer": Hourglass,
  "dormant-client": Users,
};

function iconFor(insight: Insight): LucideIcon {
  return ICONS[insight.id] ?? (insight.id.startsWith("realised-rate") ? TrendingUp : Sparkles);
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400">
          <Check size={15} />
        </span>
        <div>
          <p className="text-sm font-medium">Nothing needs your attention</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            No overdue invoices, no drafts left sitting, nothing unusual in the numbers.
            More patterns — how fast each client pays, which currency is settling well —
            appear here as the books build up history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Stagger className="grid gap-3 sm:grid-cols-2">
      {insights.map((insight) => (
        <StaggerItem key={insight.id}>
          <InsightCard insight={insight} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const tone = TONE[insight.severity];
  const Icon = iconFor(insight);

  const body = (
    <div
      className={`group h-full rounded-2xl border ${tone.ring} bg-card p-4 shadow-card transition-colors hover:bg-accent/40`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
          <Icon size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold leading-snug">{insight.title}</p>
            {insight.metric && (
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-none tabular-nums">{insight.metric.value}</p>
              </div>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{insight.detail}</p>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
            <span className="uppercase tracking-wide">{tone.label}</span>
            <span aria-hidden>·</span>
            {/* The claim's own footnote. A figure about someone's money should say
                what it was worked out from. */}
            <span>{insight.evidence}</span>
            {insight.href && (
              <ArrowUpRight
                size={13}
                className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!insight.href) return body;
  return (
    <Lift className="h-full">
      <Link href={insight.href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    </Lift>
  );
}
