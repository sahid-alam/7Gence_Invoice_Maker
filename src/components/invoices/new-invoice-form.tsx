"use client";

import { useState, useEffect } from "react";
import { InvoiceForm, type AiDraft } from "@/components/invoices/invoice-form";
import { AI_DRAFT_KEY } from "@/lib/ai/draft-key";

/**
 * Hands a composed draft to the invoice form as *initial* state.
 *
 * The draft is written to sessionStorage by the dashboard's compose bar, which means
 * it cannot be read during the server render. Applying it afterwards in an effect
 * looked equivalent and wasn't: Radix's Select learns an item's label from the render
 * that mounted it, so a value assigned later left the currency and client pickers
 * blank even though the underlying state was right.
 *
 * So the draft is read here, and a changed `key` remounts the form with the draft
 * present from its very first render. When there is no draft — the ordinary case —
 * the key never changes and nothing remounts.
 */
export function NewInvoiceForm(props: React.ComponentProps<typeof InvoiceForm>) {
  const [prefill, setPrefill] = useState<AiDraft | undefined>();

  useEffect(() => {
    const raw = sessionStorage.getItem(AI_DRAFT_KEY);
    if (!raw) return;
    // Consumed on read: refreshing the page should give a blank form, not silently
    // re-fill one the person had already cleared.
    sessionStorage.removeItem(AI_DRAFT_KEY);
    try {
      setPrefill(JSON.parse(raw) as AiDraft);
    } catch {
      /* a corrupt handoff is just an ordinary empty form */
    }
  }, []);

  return <InvoiceForm {...props} key={prefill ? "composed" : "blank"} prefill={prefill} />;
}
