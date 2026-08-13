"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { summariseBooks } from "@/actions/ai";

/**
 * Two sentences on what to do first.
 *
 * The cards below are the source of truth — every figure on them is arithmetic over
 * the reader's own rows. This is the one job a model does better than `reduce`:
 * deciding which of seven findings matters most today, and saying it the way a person
 * would. It is given the computed findings and forbidden from introducing a figure of
 * its own, so anything numeric it says is checkable on a card directly beneath it.
 *
 * On a button rather than on load, deliberately: it costs a round trip, and the
 * amounts leave the machine when it runs, so it should be something the reader asks
 * for rather than something that happens to them.
 */
export function BooksBrief({ profileId }: { profileId?: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      setText(await summariseBooks(profileId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't summarise the books");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!text && (
        <button
          onClick={run}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {busy ? "Reading your books…" : "Sum it up for me"}
        </button>
      )}

      <AnimatePresence>
        {text && (
          <motion.div
            key="brief"
            initial={reduce ? false : { opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative rounded-2xl border border-border bg-muted/40 p-4">
              <button
                onClick={() => setText(null)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss the summary"
              >
                <X size={14} />
              </button>

              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles size={11} /> Written by AI from the cards below
              </p>

              {/* A word at a time, so it reads as being composed rather than pasted.
                  Words, not characters — a per-character typewriter on a paragraph
                  about money is slow to read and faintly gimmicky. */}
              <p className="mt-2 text-sm leading-relaxed">
                {text.split(" ").map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.018, 1.6), duration: 0.25 }}
                  >
                    {word}{" "}
                  </motion.span>
                ))}
              </p>

              <p className="mt-2.5 text-[11px] text-muted-foreground">
                Every figure here comes from a card below — the model is not allowed to
                work one out. Client names are replaced before anything is sent.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
