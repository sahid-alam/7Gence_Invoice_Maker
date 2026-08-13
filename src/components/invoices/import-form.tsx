"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload, AlertTriangle, Sparkles, ScanLine, Plus, X, FileText, PenLine,
  ChevronDown, ChevronRight, Check, Loader2, CircleAlert,
} from "lucide-react";
import {
  parseInvoicePdf, parseInvoicePdfs, importInvoices,
  type ParsedUpload, type ImportStatus,
} from "@/actions/import";
import { calculateTax } from "@/lib/tax-calculator";
import type { TaxType } from "@/types/app.types";

interface Profile { id: string; display_name: string; invoice_prefix: string }
interface Row { description: string; quantity: string; unit_price: string }

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "USDT"];

const STATUSES: { value: ImportStatus; label: string; hint: string }[] = [
  { value: "paid", label: "Paid", hint: "Settled. Counts as billed, adds nothing to Earned — that only tracks payments recorded here." },
  { value: "partial", label: "Part paid", hint: "Shows the remainder as still owed on the dashboard." },
  { value: "sent", label: "Sent", hint: "Counts as outstanding. With a past due date it will show as overdue." },
  { value: "draft", label: "Draft", hint: "Kept out of every total until you change it." },
];

const TAX_TYPES: { value: TaxType; label: string }[] = [
  { value: "none", label: "No tax" },
  { value: "cgst_sgst", label: "CGST + SGST" },
  { value: "igst", label: "IGST" },
  { value: "custom", label: "Other" },
];

interface Draft {
  key: string;
  file: File | null;
  parsed: ParsedUpload | null;
  open: boolean;
  number: string;
  date: string;
  dueDate: string;
  client: string;
  address: string;
  currency: string;
  taxType: TaxType;
  taxRate: string;
  discount: string;
  status: ImportStatus;
  paidAmount: string;
  notes: string;
  rows: Row[];
  busy?: boolean;
  result?: { ok: boolean; error?: string; id?: string };
}

let seq = 0;
const blankRow = (): Row => ({ description: "", quantity: "1", unit_price: "" });

/**
 * Split a selection into requests that fit.
 *
 * A Server Action request has a body-size cap (raised to 12MB in next.config), and a
 * folder of Canva exports blows past it long before the file count matters — the
 * rejection happens before the handler runs, so no server-side guard can soften it.
 * Batching by bytes also means a slow folder shows results as they arrive instead of
 * one long silence. A single file larger than the budget still goes on its own, which
 * is the only way it can go at all.
 */
const BATCH_BYTES = 8 * 1024 * 1024;

function batchBySize(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;
  for (const f of files) {
    if (current.length && bytes + f.size > BATCH_BYTES) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(f);
    bytes += f.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function toDraft(parsed: ParsedUpload | null, file: File | null): Draft {
  return {
    key: `d${seq++}`,
    file,
    parsed,
    open: true,
    number: parsed?.invoice_number ?? "",
    date: parsed?.issue_date ?? "",
    dueDate: parsed?.due_date ?? "",
    client: parsed?.client_name ?? "",
    address: parsed?.client_address ?? "",
    currency: parsed?.currency ?? "USD",
    // Prefer the kind the document actually named — a CGST/SGST invoice re-issued as
    // a flat percentage would misstate its own tax structure, even though the total
    // comes out the same.
    taxType: parsed?.tax_type ?? (parsed?.tax_rate ? "custom" : "none"),
    taxRate: parsed?.tax_rate ? String(parsed.tax_rate) : "0",
    discount: "0",
    status: "paid",
    paidAmount: "",
    notes: parsed?.fileName ? `Imported from ${parsed.fileName}` : "",
    rows: parsed?.items.length
      ? parsed.items.map((i) => ({
          description: i.description,
          quantity: String(i.quantity),
          unit_price: String(i.unit_price),
        }))
      : [{ ...blankRow(), unit_price: parsed?.subtotal != null ? String(parsed.subtotal) : "" }],
  };
}

/** What this draft would save as, using the same maths the server will run. */
function totals(d: Draft) {
  const subtotal = d.rows.reduce(
    (s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0),
    0
  );
  const t = calculateTax({
    subtotal,
    tax_type: d.taxType,
    tax_rate: parseFloat(d.taxRate) || 0,
    discount_percent: parseFloat(d.discount) || 0,
  });
  return { subtotal, total: Math.round(t.total * 100) / 100, tax: t.tax_amount };
}

/** Empty required fields. A draft with none of these is safe to send. */
function blockers(d: Draft): string[] {
  const out: string[] = [];
  if (!d.number.trim()) out.push("invoice number");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) out.push("issue date");
  // The server rejects this too. Catching it here keeps the Ready badge from
  // promising something the import will then refuse.
  if (d.dueDate && d.date && d.dueDate < d.date) out.push("a due date on or after the issue date");
  if (!d.client.trim()) out.push("client");
  if (!d.rows.some((r) => r.description.trim())) out.push("a line item");
  const { total } = totals(d);
  if (!(total > 0)) out.push("an amount");
  if (d.status === "partial") {
    const p = parseFloat(d.paidAmount);
    if (!(p > 0) || p >= total) out.push("a valid amount received");
  }
  return out;
}

export function ImportForm({ profiles }: { profiles: Profile[] }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [reading, setReading] = useState(0);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const patch = (key: string, next: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...next } : d)));

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setReading(files.length);
    let read = 0;
    let stuck = 0;
    try {
      for (const batch of batchBySize(files)) {
        const fd = new FormData();
        batch.forEach((f) => fd.append("files", f));
        const results = await parseInvoicePdfs(fd);
        read += results.length;
        stuck += results.filter((r) => r.missing.length).length;

        // Collapse everything when several arrive — a wall of twenty open forms is
        // unreadable. The ones needing attention are opened again here.
        const many = files.length > 1;
        setDrafts((ds) => [
          ...ds,
          ...results.map((r, i) => {
            const d = toDraft(r, batch[i] ?? null);
            return { ...d, open: !many || blockers(d).length > 0 };
          }),
        ]);
        setReading((n) => Math.max(0, n - batch.length));
      }
      const s = read === 1 ? "" : "s";
      toast.success(
        stuck
          ? `Read ${read} file${s} — ${stuck} need${stuck > 1 ? "" : "s"} a look`
          : `Read ${read} file${s}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read those files");
    } finally {
      setReading(0);
    }
  }

  /** Ask the model to re-read one file the pattern matcher got wrong. */
  async function retryWithAI(d: Draft) {
    if (!d.file) return;
    patch(d.key, { busy: true });
    try {
      const fd = new FormData();
      fd.append("file", d.file);
      const result = await parseInvoicePdf(fd, "ai");
      // Replace the whole draft, but keep its identity and the file handle so the
      // button still works if the model does no better.
      setDrafts((ds) =>
        ds.map((x) =>
          x.key === d.key
            ? { ...toDraft(result, d.file), key: d.key, status: d.status, open: true }
            : x
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The AI read failed");
      patch(d.key, { busy: false });
    }
  }

  const pending = drafts.filter((d) => !d.result?.ok);
  const ready = pending.filter((d) => blockers(d).length === 0);
  const saved = drafts.filter((d) => d.result?.ok);

  async function handleImport() {
    if (!ready.length) return;
    setSaving(true);
    try {
      const outcomes = await importInvoices(
        ready.map((d) => {
          return {
            fileName: d.parsed?.fileName,
            business_profile_id: profileId,
            invoice_number: d.number.trim(),
            issue_date: d.date,
            due_date: d.dueDate || undefined,
            client_name: d.client.trim(),
            client_address: d.address.trim() || undefined,
            currency: d.currency,
            tax_type: d.taxType,
            tax_rate: d.taxType === "none" ? 0 : parseFloat(d.taxRate) || 0,
            discount_percent: parseFloat(d.discount) || 0,
            status: d.status,
            paid_amount: d.status === "partial" ? parseFloat(d.paidAmount) || 0 : undefined,
            notes: d.notes.trim() || undefined,
            items: d.rows
              .filter((r) => r.description.trim())
              .map((r) => ({
                description: r.description.trim(),
                quantity: parseFloat(r.quantity) || 0,
                unit_price: parseFloat(r.unit_price) || 0,
              })),
          };
        })
      );

      setDrafts((ds) =>
        ds.map((d) => {
          const idx = ready.findIndex((r) => r.key === d.key);
          if (idx < 0) return d;
          const o = outcomes[idx];
          return { ...d, result: { ok: o.ok, error: o.error, id: o.id }, open: !o.ok };
        })
      );

      const failed = outcomes.filter((o) => !o.ok);
      if (!failed.length) {
        toast.success(`Imported ${outcomes.length} invoice${outcomes.length > 1 ? "s" : ""}`);
        // A single import goes straight to the invoice; a batch stays put so the
        // reviewer can see what landed.
        if (outcomes.length === 1 && outcomes[0].id) router.push(`/invoices/${outcomes[0].id}`);
        else router.refresh();
      } else {
        toast.error(`${failed.length} of ${outcomes.length} didn't import — see below`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-5 text-sm dark:bg-amber-950/30">
        You need a sender identity before importing — an imported invoice has to belong
        to one. Create it under Settings first.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-8 text-center transition-colors hover:bg-accent">
          {reading > 0 ? (
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          ) : (
            <Upload size={22} className="text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {reading > 0
              ? `Reading ${reading} file${reading > 1 ? "s" : ""}…`
              : "Choose PDF invoices"}
          </span>
          <span className="text-xs text-muted-foreground">
            Pick one or select a whole folder&apos;s worth — read on the server, nothing
            is saved until you confirm
          </span>
          <input
            type="file" accept="application/pdf" multiple className="hidden"
            onChange={handleFiles} disabled={reading > 0 || saving}
          />
        </label>
        <Button
          variant="outline"
          className="h-auto sm:w-40"
          disabled={reading > 0 || saving}
          onClick={() => setDrafts((ds) => [...ds, toDraft(null, null)])}
        >
          <PenLine size={15} className="mr-2" />
          Enter by hand
        </Button>
      </div>

      {drafts.length > 0 && (
        <>
          {/* Applies to every draft */}
          <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label>Sender identity</Label>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.invoice_prefix})</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Applies to every invoice below.</p>
            </div>

            {pending.length > 1 && (
              <div className="min-w-40 space-y-1.5">
                <Label>Set all to</Label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value as ImportStatus;
                    if (!v) return;
                    setDrafts((ds) =>
                      ds.map((d) => (d.result?.ok ? d : { ...d, status: v }))
                    );
                    e.target.value = "";
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a status…</option>
                  {STATUSES.filter((s) => s.value !== "partial").map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {ready.length} of {pending.length} ready
                {saved.length > 0 && ` · ${saved.length} imported`}
              </span>
              <Button onClick={handleImport} disabled={saving || !ready.length}>
                {saving
                  ? "Importing…"
                  : ready.length === 1
                    ? "Import 1 invoice"
                    : `Import ${ready.length} invoices`}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {drafts.map((d) => (
              <DraftCard
                key={d.key}
                draft={d}
                onPatch={(next) => patch(d.key, next)}
                onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                onRetryAI={() => retryWithAI(d)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DraftCard({
  draft: d, onPatch, onRemove, onRetryAI,
}: {
  draft: Draft;
  onPatch: (next: Partial<Draft>) => void;
  onRemove: () => void;
  onRetryAI: () => void;
}) {
  const { subtotal, total } = totals(d);
  const missing = blockers(d);
  const mismatch =
    d.parsed?.total != null && Math.round(total * 100) !== Math.round(d.parsed.total * 100);
  const setRows = (rows: Row[]) => onPatch({ rows });

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card shadow-card ${
        d.result?.ok
          ? "border-green-500/40"
          : d.result?.error
            ? "border-red-500/50"
            : "border-border"
      }`}
    >
      {/* Summary line — the whole batch is scannable from these alone */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => onPatch({ open: !d.open })}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={d.open}
        >
          {d.open ? <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
                  : <ChevronRight size={15} className="shrink-0 text-muted-foreground" />}
          <span className="truncate text-sm font-medium">
            {d.number || <span className="text-muted-foreground">No number</span>}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {d.client || "—"}
          </span>
          <span className="ml-auto whitespace-nowrap text-sm font-medium tabular-nums">
            {total.toFixed(2)} {d.currency}
          </span>
        </button>

        {d.result?.ok ? (
          <Badge tone="ok"><Check size={11} /> Imported</Badge>
        ) : d.result?.error ? (
          <Badge tone="bad"><CircleAlert size={11} /> Failed</Badge>
        ) : missing.length ? (
          <Badge tone="warn"><AlertTriangle size={11} /> Needs {missing.length}</Badge>
        ) : (
          <Badge tone="ok"><Check size={11} /> Ready</Badge>
        )}

        {!d.result?.ok && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}
                  aria-label="Remove from this import">
            <X size={14} />
          </Button>
        )}
      </div>

      {d.open && !d.result?.ok && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {/* How it was read */}
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {d.parsed?.fileName ? (
                <>
                  <FileText size={12} />
                  {d.parsed.fileName}
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    {d.parsed.source === "ai" ? <Sparkles size={10} /> : <ScanLine size={10} />}
                    {d.parsed.source === "ai"
                      ? "Read by AI — check every field"
                      : d.parsed.source === "manual"
                        ? "Nothing read — entered by hand"
                        : "Read by pattern matching"}
                  </span>
                </>
              ) : (
                <>
                  <PenLine size={12} />
                  Entered by hand
                </>
              )}
              {d.file && (
                <button
                  onClick={onRetryAI}
                  disabled={d.busy}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {d.busy ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                  {d.busy ? "Reading…" : "Re-read with AI"}
                </button>
              )}
            </p>

            {d.parsed?.note && <Note tone="warn">{d.parsed.note}</Note>}
            {d.parsed?.aiError && (
              <Note tone="warn">
                AI fallback didn&apos;t run ({d.parsed.aiError}). Fill in what&apos;s missing yourself.
              </Note>
            )}
            {!!d.parsed?.missing.length && (
              <Note tone="warn">
                Couldn&apos;t find: {d.parsed.missing.join(", ")}. Left blank rather than guessed.
              </Note>
            )}
            {d.parsed?.warnings.map((w) => (
              <Note key={w} tone="bad"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</Note>
            ))}
          </div>

          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice number">
              <Input value={d.number} onChange={(e) => onPatch({ number: e.target.value })} placeholder="7GKZ" />
            </Field>
            <Field label="Currency">
              <select
                value={d.currency}
                onChange={(e) => onPatch({ currency: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </Field>
            <Field label="Issue date">
              <Input type="date" value={d.date} onChange={(e) => onPatch({ date: e.target.value })} />
            </Field>
            <Field label="Due date" hint="Optional. A past due date on a sent invoice shows as overdue.">
              <Input type="date" value={d.dueDate} onChange={(e) => onPatch({ dueDate: e.target.value })} />
            </Field>
            <Field label="Client">
              <Input value={d.client} onChange={(e) => onPatch({ client: e.target.value })} />
            </Field>
            <Field label="Client address">
              <Input value={d.address} onChange={(e) => onPatch({ address: e.target.value })} />
            </Field>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Line items
            </Label>
            {d.rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="flex-1" placeholder="Description" value={r.description}
                  onChange={(e) => setRows(d.rows.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                />
                <Input
                  className="w-20" type="number" step="0.01" placeholder="Qty" value={r.quantity}
                  onChange={(e) => setRows(d.rows.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                />
                <Input
                  className="w-28" type="number" step="0.01" placeholder="Price" value={r.unit_price}
                  onChange={(e) => setRows(d.rows.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))}
                />
                {d.rows.length > 1 && (
                  <Button variant="ghost" size="icon" className="shrink-0"
                          onClick={() => setRows(d.rows.filter((_, j) => j !== i))}
                          aria-label="Remove line">
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows([...d.rows, blankRow()])}>
              <Plus size={14} className="mr-1" /> Add line
            </Button>
          </div>

          {/* Tax and discount */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tax">
              <select
                value={d.taxType}
                onChange={(e) => onPatch({ taxType: e.target.value as TaxType })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TAX_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
              </select>
            </Field>
            {d.taxType !== "none" && (
              <Field label="Rate %" hint={d.taxType === "cgst_sgst" ? "Split in half across CGST and SGST." : undefined}>
                <Input type="number" step="0.01" value={d.taxRate}
                       onChange={(e) => onPatch({ taxRate: e.target.value })} />
              </Field>
            )}
            <Field label="Discount %">
              <Input type="number" step="0.01" value={d.discount}
                     onChange={(e) => onPatch({ discount: e.target.value })} />
            </Field>
          </div>

          {/* Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Save as">
              <select
                value={d.status}
                onChange={(e) => onPatch({ status: e.target.value as ImportStatus })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
              </select>
            </Field>
            {d.status === "partial" && (
              <Field label={`Already received (${d.currency})`}>
                <Input type="number" step="0.01" value={d.paidAmount}
                       onChange={(e) => onPatch({ paidAmount: e.target.value })} />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {STATUSES.find((s) => s.value === d.status)?.hint}
          </p>

          <Field label="Notes">
            <Input value={d.notes} onChange={(e) => onPatch({ notes: e.target.value })} />
          </Field>

          {/* Reconciliation */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Subtotal </span>
              <span className="tabular-nums">{subtotal.toFixed(2)}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Total </span>
              <span className="font-semibold tabular-nums">{total.toFixed(2)} {d.currency}</span>
              {d.parsed?.total != null && (
                <span className={`ml-2 text-xs ${mismatch ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                  {mismatch ? `PDF said ${d.parsed.total.toFixed(2)} — they disagree` : "matches the PDF"}
                </span>
              )}
            </div>
            {missing.length > 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Still needs {missing.join(", ")}
              </span>
            )}
          </div>

          {d.result?.error && <Note tone="bad">{d.result.error}</Note>}

          {d.parsed?.rawText && (
            <details className="rounded-xl border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                Show the text read from the PDF
              </summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-muted p-3 text-[11px] leading-relaxed">
                {d.parsed.rawText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const map = {
    ok: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
    warn: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    bad: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

function Note({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  const map = {
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    bad: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  };
  return (
    <p className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${map[tone]}`}>{children}</p>
  );
}
