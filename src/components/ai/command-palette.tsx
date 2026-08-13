"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  LayoutDashboard, FileText, Receipt, Banknote, BarChart3, Users, Plug, Settings,
  Plus, Upload, Sparkles, Loader2, Check, AlertTriangle, CornerDownLeft,
} from "lucide-react";
import { toast } from "sonner";
import { composeInvoiceDraft, type ComposeResult } from "@/actions/ai";
import { AI_DRAFT_KEY } from "@/lib/ai/draft-key";

/**
 * ⌘K from anywhere.
 *
 * The palette exists so composing an invoice by description isn't a dashboard
 * feature — it is available on the screen you happen to be on, which is the whole
 * point of typing a sentence instead of walking a form. Navigation and the usual
 * actions live here too, so there is one thing to reach for rather than two.
 *
 * The AI branch appears only when what you typed reads like an instruction rather
 * than a page name: below four words it is almost certainly navigation, and offering
 * "compose an invoice from 'sett'" would be noise on every keystroke.
 */

const PAGES = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/receipts", label: "Receipts", icon: Receipt },
  { href: "/payments", label: "Payments", icon: Banknote },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

const ACTIONS = [
  { href: "/invoices/new", label: "New invoice", icon: Plus },
  { href: "/invoices/import", label: "Import invoices from PDF", icon: Upload },
  { href: "/clients/new", label: "Add a client", icon: Users },
];

/**
 * Enough that it reads as an instruction rather than a page name.
 *
 * Three words, or any query carrying a figure — "bill nimbus 95000" is a perfectly
 * ordinary instruction and a stricter word count would answer it with "Nothing
 * matches" and no hint that composing was ever an option.
 */
const looksLikeInstruction = (q: string) => {
  const t = q.trim();
  return t.split(/\s+/).length >= 3 || /\d/.test(t);
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const router = useRouter();
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Starting fresh each time is what keeps it feeling like a command line rather
  // than a window you left open.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function compose() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await composeInvoiceDraft(query));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  function openInForm() {
    if (!result) return;
    sessionStorage.setItem(AI_DRAFT_KEY, JSON.stringify(result.draft));
    setOpen(false);
    router.push("/invoices/new");
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search, or describe an invoice…"
        value={query}
        onValueChange={(v) => { setQuery(v); setResult(null); }}
      />

      <CommandList>
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div
              key="result"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3"
            >
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Here&apos;s what I read
              </p>
              <ul className="mt-2 space-y-1.5 px-1">
                {result.understood.map((line, i) => (
                  <motion.li
                    key={line}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Check size={14} className="mt-0.5 shrink-0 text-green-600" />
                    {line}
                  </motion.li>
                ))}
                {result.caveats.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
              <button
                onClick={openInForm}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
              >
                Open in form <CornerDownLeft size={13} />
              </button>
              <p className="mt-2 px-1 text-center text-xs text-muted-foreground">
                Nothing is saved yet.
              </p>
            </motion.div>
          ) : (
            <motion.div key="list" initial={false} exit={{ opacity: 0 }}>
              <CommandEmpty>
                {looksLikeInstruction(query)
                  ? "Press Compose below to turn this into a draft invoice."
                  : "Nothing matches."}
              </CommandEmpty>

              {looksLikeInstruction(query) && (
                <CommandGroup heading="Compose">
                  <CommandItem value={`__compose__ ${query}`} onSelect={compose}>
                    {busy ? (
                      <Loader2 size={15} className="mr-2 animate-spin" />
                    ) : (
                      <Sparkles size={15} className="mr-2" />
                    )}
                    <span className="truncate">
                      {busy ? "Reading…" : `Draft an invoice from “${query}”`}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              <CommandGroup heading="Actions">
                {ACTIONS.map((a) => (
                  <CommandItem key={a.href} value={a.label} onSelect={() => go(a.href)}>
                    <a.icon size={15} className="mr-2" />
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup heading="Go to">
                {PAGES.map((p) => (
                  <CommandItem key={p.href} value={p.label} onSelect={() => go(p.href)}>
                    <p.icon size={15} className="mr-2" />
                    {p.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </motion.div>
          )}
        </AnimatePresence>
      </CommandList>
    </CommandDialog>
  );
}
