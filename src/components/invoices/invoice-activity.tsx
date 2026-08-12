import {
  FilePlus2,
  Pencil,
  Send,
  Undo2,
  XCircle,
  Mail,
  Banknote,
  Trash2,
  CloudUpload,
  CloudOff,
  Circle,
  History,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { InvoiceEvent } from "@/lib/invoice-events";

/**
 * Every event needs a dot colour, an icon and a sentence. Tone is meaning, not
 * decoration: amber = needs your attention, green = money in, red = reversed.
 */
const LOOK: Record<string, { icon: LucideIcon; label: string; dot: string; fg: string }> = {
  created:            { icon: FilePlus2,   label: "Created",             dot: "bg-gray-300",   fg: "text-gray-500" },
  edited:             { icon: Pencil,      label: "Edited",              dot: "bg-blue-400",   fg: "text-blue-600" },
  sent:               { icon: Send,        label: "Sent",                dot: "bg-blue-500",   fg: "text-blue-600" },
  unsent:             { icon: Undo2,       label: "Back to draft",       dot: "bg-amber-500",  fg: "text-amber-600" },
  voided:             { icon: XCircle,     label: "Voided",              dot: "bg-red-500",    fg: "text-red-600" },
  emailed:            { icon: Mail,        label: "Emailed",             dot: "bg-blue-400",   fg: "text-blue-600" },
  payment_recorded:   { icon: Banknote,    label: "Payment received",    dot: "bg-green-500",  fg: "text-green-600" },
  payment_deleted:    { icon: Trash2,      label: "Payment removed",     dot: "bg-red-500",    fg: "text-red-600" },
  settled:            { icon: Banknote,    label: "Credited to bank",    dot: "bg-green-500",  fg: "text-green-600" },
  exported_to_drive:  { icon: CloudUpload, label: "Saved to Drive",      dot: "bg-gray-300",   fg: "text-gray-500" },
  removed_from_drive: { icon: CloudOff,    label: "Removed from Drive",  dot: "bg-gray-300",   fg: "text-gray-500" },
};

/** One short line of context, or nothing. Never a second sentence. */
function detailOf(e: InvoiceEvent): string | null {
  const d = e.detail ?? {};
  const money = (a: unknown, c: unknown) =>
    a != null && c ? formatCurrency(Number(a), String(c)) : null;

  switch (e.type) {
    case "created":
      return money(d.total, d.currency);
    case "edited":
      return money(d.total, d.currency);
    case "emailed":
      return d.to ? String(d.to) : null;
    case "payment_recorded": {
      const amt = money(d.total_amount, d.currency);
      const mode = d.payment_mode ? String(d.payment_mode).replace(/_/g, " ") : null;
      return [amt, mode].filter(Boolean).join(" · ") || null;
    }
    default:
      return null;
  }
}

/**
 * "sahidalam2709@gmail.com" → "sahidalam2709". Full addresses are too long for a
 * 320px rail and the domain carries nothing when everyone is in one org.
 */
function actorOf(e: InvoiceEvent): string | null {
  const by = e.detail?.by;
  if (typeof by !== "string" || !by) return null;
  return by.split("@")[0];
}

function when(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
  };
}

/**
 * Activity rail for one invoice.
 *
 * Records what happened, when, and — since members exist — who. The actor is
 * snapshotted onto the event rather than joined, so history stays true even if
 * that person later changes address or leaves the org. Events written before
 * members existed have no actor and simply show the time.
 */
export function InvoiceActivity({
  events,
  error,
}: {
  events: InvoiceEvent[];
  /** Query failed — distinct from "nothing has happened yet". */
  error?: string | null;
}) {
  // Newest first: the last thing that happened is the thing you came to check.
  const ordered = [...events].reverse();

  return (
    <aside className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <History size={14} className="text-muted-foreground" />
        Activity
      </h3>

      {error ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Activity isn&apos;t set up yet — run migration 0015. ({error})
        </p>
      ) : ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing recorded yet. Sending, edits and payments will show up here.
        </p>
      ) : (
        <ol className="relative">
          {/* One continuous rail behind the dots. Omitted for a single event —
              a line connecting nothing to nothing reads as a rendering bug. */}
          {ordered.length > 1 && (
            <span className="absolute left-[7px] top-2 bottom-3 w-px bg-border" aria-hidden />
          )}

          {ordered.map((e) => {
            const look = LOOK[e.type] ?? {
              icon: Circle,
              label: e.type.replace(/_/g, " "),
              dot: "bg-gray-300",
              fg: "text-gray-500",
            };
            const Icon = look.icon;
            const detail = detailOf(e);
            const actor = actorOf(e);
            const t = when(e.created_at);

            return (
              <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                <span className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full ring-4 ring-card ${look.dot}`} />
                <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon size={13} className={`shrink-0 ${look.fg}`} />
                      {look.label}
                    </p>
                    <time
                      dateTime={e.created_at}
                      title={new Date(e.created_at).toLocaleString("en-IN")}
                      className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                    >
                      {t.day}
                    </time>
                  </div>
                  {detail && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={detail}>
                      {detail}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                    {actor ? `${actor} · ${t.time}` : t.time}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
