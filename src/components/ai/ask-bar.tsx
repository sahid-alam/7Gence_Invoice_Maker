"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, CornerDownLeft, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { composeInvoiceDraft, type ComposeResult } from "@/actions/ai";
import { AI_DRAFT_KEY } from "@/lib/ai/draft-key";

/**
 * Start an invoice by describing it.
 *
 * The interaction is deliberately two-step: compose, then read back what was
 * understood, then open the form. A one-step "it made an invoice" would be faster and
 * much worse — the person would be confirming a saved document instead of a draft,
 * and the first time it misread a figure they would stop trusting the whole feature.
 *
 * Nothing here writes. The button at the end opens the ordinary invoice form with the
 * fields filled in, where the normal save path applies.
 */

const EXAMPLES = [
  "Invoice Kakion €1,200 for Kakion OS phase 3, due in 30 days",
  "Bill Nimbus ₹95,000 for the August retainer plus 18% GST",
  "Northwind, 12 days of consulting at $450/day, net 45",
  "Charge Ledger Bay $2,400 for the motion system, net 15",
  "Harbourline, 4 days of dashboard work at €650 a day",
];

/**
 * The example prompts, scrolling past.
 *
 * They were a static row and read as content — at a glance people took them for
 * findings about their own books rather than things they could type. Moving them
 * fixes that on its own: nothing on a dashboard drifts sideways except a suggestion
 * reel, so the motion itself says "these are examples". The standing "Try" label and
 * the quieter, italic, quoted styling do the rest.
 *
 * The edges are masked rather than clipped, so prompts dissolve at the boundary
 * instead of being guillotined mid-word.
 */
function ExampleTicker({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Try
      </span>
      <div
        className="ticker-track relative min-w-0 flex-1 overflow-hidden py-0.5"
        style={{
          // A generous fade on both sides: too narrow and a prompt reads as clipped
          // rather than dissolving, which looks like a layout bug.
          maskImage:
            "linear-gradient(to right, transparent, #000 9%, #000 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 9%, #000 88%, transparent)",
        }}
      >
        <div className="animate-ticker flex w-max gap-2">
          {/* Twice, so the -50% travel loops seamlessly. The copy is hidden from
              screen readers — one reading of the list is enough. */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-2" aria-hidden={copy === 1}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => onPick(ex)}
                  tabIndex={copy === 1 ? -1 : 0}
                  className="whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1 text-xs italic text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:not-italic hover:text-foreground"
                >
                  &ldquo;{ex}&rdquo;
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AskBar() {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const reduce = useReducedMotion();

  async function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await composeInvoiceDraft(text));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  function openInForm() {
    if (!result) return;
    sessionStorage.setItem(AI_DRAFT_KEY, JSON.stringify(result.draft));
    router.push("/invoices/new");
  }

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-2xl border bg-card shadow-card transition-colors ${
          busy ? "border-foreground/25" : "border-border focus-within:border-foreground/30"
        }`}
      >
        {/* A sweep of light while the model is reading — a spinner alone reads as
            "stuck", a moving band reads as "working". */}
        <AnimatePresence>
          {busy && !reduce && (
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent"
                animate={{ x: ["-100%", "400%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 px-4 py-3">
          <Sparkles size={16} className={busy ? "animate-pulse text-foreground" : "text-muted-foreground"} />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={busy}
            placeholder="Describe an invoice — “Invoice Kakion €1,200 for phase 3, due in 30 days”"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            aria-label="Describe an invoice in your own words"
          />
          {busy ? (
            <Loader2 size={15} className="shrink-0 animate-spin text-muted-foreground" />
          ) : value.trim() ? (
            <button
              onClick={submit}
              className="flex shrink-0 items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background"
            >
              Compose <CornerDownLeft size={11} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Examples, until the person has typed something */}
      <AnimatePresence mode="wait">
        {!value && !result && !busy && (
          <motion.div
            key="examples"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ExampleTicker
              onPick={(text) => { setValue(text); inputRef.current?.focus(); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* What it understood */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={reduce ? false : { opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Here&apos;s what I read
                </p>
                <button
                  onClick={() => setResult(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>

              <ul className="mt-3 space-y-1.5">
                {result.understood.map((line, i) => (
                  <motion.li
                    key={line}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.3 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Check size={14} className="mt-0.5 shrink-0 text-green-600" />
                    {line}
                  </motion.li>
                ))}
                {result.caveats.map((line, i) => (
                  <motion.li
                    key={line}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * (result.understood.length + i), duration: 0.3 }}
                    className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {line}
                  </motion.li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Nothing is saved yet — this opens the normal form.
                </p>
                <Button size="sm" onClick={openInForm}>Open in form</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
