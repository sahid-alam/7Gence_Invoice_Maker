"use client";

/**
 * The animated leaves.
 *
 * Motion needs the client, but the dashboard must not — the `getClaims()` work that
 * took navigations from ~230ms to ~40ms only holds if pages stay server components
 * doing their own data fetching. So everything here takes *finished values* as props
 * and animates their presentation. No component in this file fetches, computes, or
 * knows what a payment is.
 *
 * All of it degrades to a plain static render under `prefers-reduced-motion`, which
 * is not a nicety: a money figure that spins up from zero is precisely the animation
 * someone with vestibular sensitivity needs switched off.
 */

import { useEffect, useRef, useState } from "react";
import {
  motion, useInView, useMotionValue, useSpring, useReducedMotion,
  type Variants,
} from "framer-motion";

/** One shared ease so unrelated elements feel like one system. */
const EASE = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * Reveals its children one after another.
 *
 * The stagger is what makes a dashboard read as composed rather than dumped: the eye
 * is walked across the cards in the order they matter, at 55ms apart — fast enough
 * not to feel like waiting, slow enough to register as sequence.
 */
export function Stagger({
  children, className, as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "ul";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <Comp className={className} variants={container} initial="hidden" animate="show">
      {children}
    </Comp>
  );
}

/** A single staggered child. Must sit inside <Stagger>. */
export function StaggerItem({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div variants={item} className={className}>{children}</motion.div>;
}

/** Reveals once, when scrolled into view. For anything below the fold. */
export function RevealOnScroll({
  children, className, delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A number that settles into place.
 *
 * Spring rather than a linear tween, because a figure that decelerates reads as
 * arriving at a value; one that ticks up at constant speed reads as still counting.
 * The digits are tabular so the width doesn't jitter while it runs.
 *
 * `prefix`/`suffix` are rendered statically — only the digits animate, so a currency
 * symbol never flickers.
 */
export function CountUp({
  value, prefix = "", suffix = "", decimals = 0, className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 20, mass: 0.8 });
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    mv.set(value);
    return spring.on("change", (v) => setShown(v));
  }, [value, reduce, mv, spring]);

  const text = shown.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}{text}{suffix}
    </span>
  );
}

/**
 * A bar that grows from its baseline.
 *
 * Used for the aging bars and the mini trend. Height is a percentage so the caller
 * keeps control of the scale — this only owns the motion.
 */
export function GrowBar({
  pct, className, delay = 0, title,
}: {
  pct: number;
  className?: string;
  delay?: number;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const height = `${Math.max(2, Math.min(100, pct))}%`;
  if (reduce) return <div className={className} style={{ height }} title={title} />;
  return (
    <motion.div
      className={className}
      title={title}
      initial={{ height: 0 }}
      animate={{ height }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    />
  );
}

/** Lifts slightly under the pointer. For cards that are links. */
export function Lift({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}
