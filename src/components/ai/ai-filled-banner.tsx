"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

/**
 * Says plainly that a machine filled these fields in.
 *
 * A form that silently arrives pre-filled invites the person to skim it. Naming the
 * source is what turns skimming into checking — and this is the last screen before a
 * number reaches the books.
 */
export function AiFilledBanner() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Sparkles size={14} />
      </span>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Filled in from your description.</span>{" "}
        Check every figure before saving — nothing has been created yet, and the invoice
        number is only drawn when you save.
      </p>
    </motion.div>
  );
}
