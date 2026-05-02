# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                          # start dev server (localhost:3000)
NODE_OPTIONS="--max-old-space-size=4096" npm run build   # production build (needs extra memory)
npm run lint                         # ESLint check
npx tsc --noEmit                     # type check only

# Supabase (requires supabase CLI)
supabase start                       # start local Supabase
supabase db push                     # apply migrations to hosted project
supabase gen types typescript --project-id <id> > src/types/database.types.ts
```

## Environment variables required

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Copy `.env.example` to `.env.local` and fill in values from your Supabase project dashboard.

## Architecture

**Next.js 14 App Router** with Supabase (auth + PostgreSQL + Storage). All mutations use Next.js Server Actions (`src/actions/`). Data fetching uses React Server Components. Client components are only used where interactivity is needed (`"use client"`).

### Auth model

Single shared Supabase account for the whole 7Gence team. All team members log in with the same credentials via magic link (`/login`). There is no per-user data isolation — `owner_id` on every table points to this single shared user. **Profiles** (not auth users) represent individual team members (Sahid, Anas, etc.) and are the "sender identity" selected when creating an invoice.

### Route groups

- `(auth)` — login page, no sidebar
- `(app)` — all protected routes, guarded in both `src/middleware.ts` and `src/(app)/layout.tsx`
- `api/` — PDF generation routes and a payment-methods fetch endpoint

### Data flow for invoices

1. User selects a **business profile** → fetches payment methods for that profile via `/api/payment-methods?profile_id=`
2. Form calls the `createInvoice` Server Action
3. Action calls the Postgres function `next_invoice_number(profile_id)` atomically before inserting — never use `MAX() + 1`
4. Invoice row is inserted with denormalized client snapshot and `payment_method_snapshot` (jsonb) — snapshots ensure historical PDFs are correct even if source data changes later
5. When `updateInvoiceStatus(id, "paid")` is called, a receipt row is auto-created

### PDF generation

`/api/invoices/[id]/pdf` and `/api/receipts/[id]/pdf` use `@react-pdf/renderer`'s `renderToStream()`. Templates live in `src/components/pdf/templates/`. Two templates:
- `white-caps` — white background, letter-spaced ALL CAPS heading
- `cream-serif` — cream (#F5F0E8) background, large Playfair Display "Invoice" heading

**Fonts must be bundled locally** in `public/fonts/` as `.ttf` files. `src/lib/pdf/fonts.ts` registers them with `Font.register()` using local paths. Never use Google Fonts URLs in the PDF renderer — they may not resolve at build/render time. Required font files: `Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-Bold.ttf`, `PlayfairDisplay-Regular.ttf`, `PlayfairDisplay-Bold.ttf`.

### Tax logic

`src/lib/tax-calculator.ts` handles all tax math. Tax rates stored in the DB as decimals (`0.18` = 18%); the UI layer works in percentages. The `tax_type` enum drives the split:
- `cgst_sgst` → split rate in half for CGST and SGST (intrastate India)
- `igst` → full rate as IGST (interstate or international)
- `custom` → arbitrary percentage
- `none` → no tax (default for foreign clients)

`overdue` is never stored — derive it everywhere as `status = 'sent' AND due_date < current_date`.

### Key types

All domain types live in `src/types/app.types.ts`: `InvoiceStatus`, `TaxType`, `PaymentMethodType`, `TemplateId`, `CurrencyCode`, `PaymentMethodSnapshot`. No generated Supabase types yet — add them by running `supabase gen types`.

### Supabase client usage

- **Server Components / Route Handlers / Server Actions**: `import { createClient } from "@/lib/supabase/server"`
- **Client Components**: `import { createClient } from "@/lib/supabase/client"`
- **Middleware**: uses `createServerClient` directly from `@supabase/ssr`

### Adding shadcn/ui components

```bash
npx shadcn@latest add <component-name>
```

The project uses New York style with Neutral base color and CSS variables. Config is in `components.json`.
