# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                          # start dev server (localhost:3000)
NODE_OPTIONS="--max-old-space-size=4096" npm run build   # production build (needs extra memory)
npm run lint                         # ESLint check
npx tsc --noEmit                     # type check only
node --test src/lib/*.test.ts        # unit checks (node's built-in runner, no framework)

# Development sandbox — NEVER test against the real organization's books
node --env-file=.env scripts/dev-account.mjs   # create/reset dev@7gence.dev in its own org
node --env-file=.env scripts/seed-sandbox.mjs  # 18 months of realistic books in that org

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
TOKEN_ENCRYPTION_KEY=      # 64-char hex (32 bytes), AES-256-GCM key for OAuth tokens at rest
GOOGLE_CLIENT_ID=          # Google OAuth app, for Drive export
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=       # used to build the OAuth redirect URI
```

Copy `.env.example` to `.env.local` and fill in values from your Supabase project dashboard.
Gmail SMTP credentials are **not** env vars — they are stored per-owner in the `app_settings` table (see Email).

## Deferred — decided, not done

Known and deliberate. Each says why it was left, so nobody re-derives the reasoning.

| Item | Why it's waiting |
|---|---|
| **Which jurisdiction the app is modelling** | 7Gence is **US-registered**, money lands in an Indian account. The app assumes an India-resident exporter throughout: Apr–Mar year, GST export rules, FIRC, the 9-month FEMA clock. A US entity may file Jan–Dec with no FIRC concept at all. **Needs a CPA/CA before more compliance logic is built** — it affects the FY filter, the Earned figure, and what invoices should say. Highest-value open question in the project. |
| **Auth emails on a real domain** | Password reset uses Supabase's built-in mailer: a few sends per hour, development-grade. Point Supabase at SMTP on 7Gence's own domain (Authentication → Email Templates → SMTP Settings) — the app already holds Gmail SMTP credentials for invoices, but Supabase auth mail is configured separately. Until then, an owner adding/resetting from Settings is the reliable path. |
| **`owner_id` → `created_by` rename** | Needs DB and app to change in lockstep; any gap breaks every write. Buys clarity, not behaviour. Do it as its own add/backfill/drop cycle when nothing else is in flight. |
| **Per-member Gmail sender** | `app_settings` is `unique(org_id)`, so the team shares one sending address. Per-person means `unique(org_id, user_id)` plus a sender picker. |
| **Logs / Alerts screens** | Modelled on Kakion OS, which logs LLM and agent calls. This app has none yet — the pages would be empty scaffolding. Build them alongside the AI work, when there are real events to show. |
| **FY overview · import past invoices · AI insights (Groq)** | All asked for. Import's hard part is invoice numbering (imported numbers must not collide with the atomic counter), and AI's is deciding what leaves the infrastructure — aggregates can go where client names, amounts and bank details shouldn't. |

## Architecture

**Next.js 14 App Router** with Supabase (auth + PostgreSQL + Storage). All mutations use Next.js Server Actions (`src/actions/`). Data fetching uses React Server Components. Client components are only used where interactivity is needed (`"use client"`).

### Organizations (tenancy)

**`org_id` is the tenancy key. Never scope a query by `owner_id`.** Every page, action and route resolves the caller with `requireMember()` from `src/lib/auth.ts` and filters `.eq("org_id", member.orgId)`. Writes stamp both: `org_id` (who may see it) and `owner_id` (who did it). Two columns, two questions — don't collapse them.

API route handlers use `getMember()` rather than `requireMember()`, because a route must answer 401 and `requireMember()` redirects.

Concepts, kept distinct: an **organization** is the tenant, a **member** is a person who logs in, a **business profile** is the sender identity on an invoice. A member may point at a default profile. Don't collapse member and profile — a profile is a billing identity with its own invoice series and tax numbers, and welding login to it means one person can never hold two, nor two people share one.

RLS goes through `private.my_org_ids()` and `private.is_org_owner()` — both `SECURITY DEFINER` so they bypass RLS internally. That is what avoids the recursion a policy on `organization_members` querying `organization_members` would otherwise cause (this bit us in 0016, fixed in 0018). Keep the `auth.uid()` check inside the function, and keep calls wrapped in `(select ...)` so they run once per statement rather than once per row.

Gmail and Drive connections are **per-org**, keyed `unique(org_id)` and `unique(org_id, provider)`.

Activity events snapshot the actor's email into `detail.by` at write time rather than joining `auth.users` (not exposed through the API). A snapshot is also the more correct answer for a trail: it records who it was at the time.

Member management lives in `src/actions/members.ts` and surfaces on `/settings`. Those actions use the **service-role** client because they touch `auth.users`, which the anon key cannot read — so every one of them checks `member.role === "owner"` first. Never add a member action that skips that check.

New members are created with a password shown once to the owner, rather than emailed an invite link: Supabase's built-in mailer is rate-limited and needs SMTP configured, and a link that silently never arrives is worse than a password handed over directly. That password is generated **server-side with `randomBytes(16)`** — never in the browser. `Math.random()` is not a CSPRNG and a short word-pattern carries ~19 bits; this credential opens every invoice and bank detail in the org. Adding someone who already has an account never resets their password.

### Development sandbox

**Never develop or test against the real organization.** `scripts/dev-account.mjs` creates `dev@7gence.dev` in its own **Dev Sandbox** org with its own `DEV` sender profile; isolation is the ordinary org RLS, so the sandbox account simply cannot see the real books. Run it with `node --env-file=.env scripts/dev-account.mjs` and check the sidebar footer reads "Dev Sandbox · Owner" before testing anything that writes.

This exists because testing against the real org has twice corrupted live data — a fabricated bank credit, and three orphan payment rows that inflated Earned by ₹97,830. The script uses the service-role key, which bypasses RLS, so it resolves the sandbox org **only** by its exact name and refuses to run if the dev user is somehow a member of any other org.

`scripts/seed-sandbox.mjs` then fills it with eighteen months of books. It is **the fixture the insights engine is designed against**, so its shape is deliberate: five clients with genuinely different payment behaviour, three currencies, a dormant client, a real overdue tail, and an FX rate that drifts so a realised-rate trend has something to say. Change the thresholds in `insights.ts` and this is what tells you whether they still fire sensibly. It wipes the sandbox org's books first, so re-running gives identical data.

### Insights

`src/lib/insights.ts` computes what the dashboard's "What stands out" panel says. **No language model is involved**, and none should be: every figure is arithmetic over the reader's own rows, and a hallucinated rupee figure in a ledger is worse than no figure at all.

The hard part is not computing them, it's **knowing when to stay quiet**. On a book with two clients, "88% of income comes from one client" is a restatement of having two clients, not a finding. Every function returns `null` below a stated evidence threshold — 4 paying clients before concentration is reported, 3 paid invoices from a client before its payment speed means anything, 4 settlements spanning 120 days before an FX move is a trend. The thresholds are named constants at the top of the file so they are visible and testable, and `insights.test.ts` tests the **suppression** cases as hard as the firing ones. A panel that is mostly empty in month one and fills in over a year is behaving correctly.

Each insight carries an `evidence` line ("median of 6 paid invoices") that renders on the card. A claim about someone's money should say what it was worked out from.

Deliberately **not** included: a FEMA 270-day realisation countdown. That is exactly the compliance logic the entity question in Deferred parks pending a CPA/CA — an insights panel must not quietly resolve it.

### AI features

Two, and the split between them is the point: **the model never produces a number that reaches the books.**

`src/lib/ai/compose-invoice.ts` turns a sentence ("invoice Kakion €1,200 for phase 3, due in 30 days") into a draft. It uses **`openai/gpt-oss-120b` with strict `json_schema`** — on Groq, strict structured outputs run only on the gpt-oss models, which is why this doesn't share a model with the PDF importer. Two limits make it safe:

- **It fills a form, it does not create an invoice.** The draft lands in the ordinary `/invoices/new` form for a person to confirm, and **no invoice number is reserved** — `createInvoice` calls `next_invoice_number()` at save time, so an abandoned AI draft can't burn a number out of a series GST wants sequential.
- **The client list never leaves the machine.** The model sees only the typed sentence and returns whatever name it read; `src/actions/ai.ts` matches that locally against the org's clients. A model that never saw the customer list can neither leak it nor invent a plausible-sounding customer.

Which GST applies is resolved **locally** with `suggestTaxType`, never by the model — CGST+SGST versus IGST turns on sender and client state, which is in the database, not in the sentence.

The handoff runs through `sessionStorage` (`lib/ai/draft-key.ts`), consumed on read. `NewInvoiceForm` reads it and remounts `InvoiceForm` via a changed `key` so the draft is present at **first render**: Radix's `Select` learns an item's label from the render that mounted it, so a value assigned later in an effect leaves the trigger visibly blank. Don't move this back into an effect.

`CommandPalette` (⌘K, mounted in the `(app)` layout) makes composing available from any screen, alongside navigation and the usual actions. The compose option only appears once the query is four words or more — below that it is almost certainly navigation.

`src/lib/ai/brief.ts` + `summariseBooks()` write the "Sum it up for me" paragraph above the insight cards. It is handed the **already-computed findings** and forbidden from introducing a figure of its own, so everything numeric it says is checkable on a card directly beneath it. The model's job is deciding what matters most today and saying it like a person — the one thing here it does better than `reduce`.

Three things keep it honest, and none of them are optional:

- **Findings are recomputed server-side**, never accepted from the browser. A client that could post arbitrary "findings" could talk the model into saying anything, and this text sits directly above real money.
- **Client names are pseudonymised** (`CLIENT_1`, `CLIENT_2`) before the call and restored after, longest name first so "Kakion" doesn't half-rewrite "Kakion Ltd". The amounts do leave the machine — that is the honest cost of a summary that says anything useful, and it is why this is a **button, not something that runs on page load**.
- It refuses to summarise a ledger that failed to load, rather than confidently describing an incomplete picture.

`gpt-oss` reasons before it answers and bills that thinking against the same `max_tokens`, so a tight cap returns empty `content` with the whole allowance spent reasoning. Hence `reasoning_effort: "low"` and generous headroom; a `finish_reason === "length"` is reported distinctly from an empty answer.

Deliberately **not** built: free-form "ask your books" Q&A. That is a whole query-planning surface, and for a handful of clients the insight cards already answer most of it.

### Motion

`src/components/motion/primitives.tsx` holds the animated leaves: `Stagger`/`StaggerItem`, `RevealOnScroll`, `CountUp`, `GrowBar`, `Lift`.

**Pages stay server components; motion lives in the leaves.** They take finished values as props and animate their presentation — none of them fetches or computes. Turning the dashboard itself into a client component would give up RSC data fetching on the busiest screen and undo the `getClaims()` navigation work.

Everything degrades to a static render under `useReducedMotion`. That is not a nicety — a money figure spinning up from zero is precisely the animation someone with vestibular sensitivity needs off.

### Importing past invoices

`/invoices/import` brings pre-existing PDF invoices into the books, one file or a folder's worth. Three layers, in order, and **no path is a dead end** — a scan with no text layer, a corrupt file and a model outage all land on an editable form rather than an error page:

1. `src/lib/invoice-extract.ts` — deterministic pattern matching. No value imports, so `node --test` can run it directly. Returns nulls, never guesses: an ambiguous `06/07/2026` becomes `null` because a wrong invoice date is worse than an empty field.
2. `src/lib/groq-extract.ts` — asked only when something critical (total, client, date) came back empty, or when the reviewer presses "Re-read with AI". Temperature 0, nulls allowed, defensive coercion. **`redactBankDetails()` strips account numbers, IFSC and sort codes before anything leaves the machine** — an imported invoice's payment block is irrelevant, since a re-issued invoice takes its own from the sender profile.
3. The review form. Nothing saves without a person confirming, which is what makes the model fallback safe.

**Line items reconcile against the subtotal, not the total.** A tax-inclusive total compared against pre-tax lines flags every correct GST invoice as broken. `review()` uses `subtotal ?? total`, and warns separately when a rate was found but no subtotal line was — that means the lines were filled from the total and now double-count the tax.

Imports keep their original number (the client and the bank saw it); the unique index on `(business_profile_id, invoice_number)` stops clashes, and the profile counter is only nudged when the old number matches that profile's own pattern. **No payment row is ever created, whatever the status** — `paid_amount` records what the client settled, while Earned counts rows in `payments`, which exist only for money this app watched arrive. A batch imports row by row: one failure never rolls back the rest.

### Password reset

`/forgot-password` (public) emails a link → `/auth/callback` exchanges the code → `/reset-password` sets the new one. `/reset-password` lives **outside the `(app)` group on purpose**: that layout requires an org membership, and someone locked out of an org must still be able to fix their own account. It doubles as the signed-in "Change password" from Settings, so one page serves both arrivals.

`/reset-password` is deliberately **not** in middleware's `isAuthRoute` list — it needs a session (the recovery link provides one), and listing it would bounce the very people it exists for.

The forgot-password screen always claims success, even for an unknown address, so it can't be used to enumerate which emails have accounts.

**Profiles are not in the main nav** — they live under Settings as "Sender identity", because a profile is configuration (the "From" block, invoice numbering, bank details), not a daily destination. `ProfileFilter` already returns null at ≤1 profile, so with one identity the picker disappears from the dashboard and lists entirely.

Migration 0020 dropped the old `auth.uid() = owner_id` policies. `owner_id` is deliberately **not** renamed to `created_by` yet: the rename needs the DB and app to change in lockstep and buys clarity, not behaviour.

Full plan: https://claude.ai/code/artifact/12912b9e-9fab-46b7-b03e-2dbaeb7c0e0b

### Auth model

Each person has their own account and signs in with email + password at `/login`, via `supabase.auth.signInWithPassword` — **not** magic link. Data is scoped by organization, not by user: see Organizations above. `developer7gence@gmail.com` is the org's original owner account; individual members (e.g. `sahidalam2709@gmail.com`) are separate users in `organization_members`.

In Server Components, read the user with `getUser()` from `src/lib/auth.ts`. It returns `{ id, email }` and is built on **`supabase.auth.getClaims()`, not `supabase.auth.getUser()`**.

This is the single biggest performance lever in the app. `getUser()` makes a network round trip to the Supabase auth server on every call and is never cached — measured at 200–560ms each. It ran twice per navigation (once in `src/middleware.ts`, once in the layout), which put a ~230ms floor under every sidebar click regardless of how much data the page queried. `getClaims()` verifies the JWT signature locally against the project's JWKS (this project uses asymmetric signing keys): ~300ms once per server process, then ~0ms. Navigations dropped to 31–72ms.

`getClaims()` is still a real signature check. Do **not** "optimise" further to `getSession()`, which returns the cookie's contents unverified and would accept a forged cookie. Server Actions still call `supabase.auth.getUser()` directly; that's the mutation path, where one round trip is not the bottleneck.

### Route groups

- `(auth)` — login page, no sidebar
- `(app)` — all protected routes, guarded in both `src/middleware.ts` and `src/(app)/layout.tsx`
- `api/` — PDF generation, payments CSV export, payment-methods fetch, and the Google OAuth start/callback pair

### Data flow for invoices

1. User selects a **business profile** → fetches payment methods for that profile via `/api/payment-methods?profile_id=`
2. Form calls the `createInvoice` Server Action
3. Action calls the Postgres function `next_invoice_number(profile_id)` atomically before inserting — never use `MAX() + 1`
4. Invoice row is inserted with denormalized client snapshot and `payment_method_snapshot` (jsonb) — snapshots ensure historical PDFs are correct even if source data changes later
5. When `updateInvoiceStatus(id, "paid")` is called, a receipt row is auto-created

### Correcting a sent invoice

`unsendInvoice` moves `sent` → `draft` so the invoice can be edited and re-sent, keeping its number.

Chosen over the two alternatives deliberately. **Editing in place** would leave two different documents sharing one invoice number, with no way to know which the client holds, while Outstanding keeps counting a figure that is about to change. **Voiding and reissuing** permanently burns a number, and GST wants the series sequential — a ledger full of voids for reworded line items is hard to defend at audit.

Un-send is **refused once any payment is applied** (checked against `payment_invoice_links`, not just status). Past that point the invoice is reconciled against a bank credit and an FIRC, so the correct instrument is a credit note. Void remains for genuine cancellations.

`updateInvoice` enforces draft-only server-side. The edit page already redirected non-drafts, but Server Actions are directly callable, so the check belongs in the action too.

### Invoice activity trail

`invoice_events` (migration 0015) records what happened to each invoice: created, edited, sent, unsent, voided, emailed, payment recorded/deleted, exported to Drive. Written via `logInvoiceEvent()` from `src/lib/invoice-events.ts`, rendered by `InvoiceActivity` on the invoice page.

Three properties worth preserving:

- **Append-only by policy.** SELECT and INSERT have RLS policies; UPDATE and DELETE deliberately do not, and under RLS an operation with no policy is denied. Don't add those policies.
- **Logging never throws.** `logInvoiceEvent` swallows its own errors — an invoice that saved but wasn't logged beats one that refused to save because logging broke. The trade-off is that the trail can have gaps, so treat it as a record, not a source of authority.
- **It names who acted**, via `detail.by` snapshotted at write time. Events written before members existed have no actor and render with just a timestamp — leave them alone rather than backfilling a guess.

Events cascade-delete with their invoice, so deleting an invoice erases its history too.

### Payment methods

`bank_transfer`, `upi` and `crypto_wallet` use fixed columns on `payment_methods`. **`wise` does not** — Wise hands out a different identifier set per currency (USD routing number, GBP sort code, EUR IBAN, AED Swift-only), so there is no stable column set to model. Instead `src/lib/wise.ts` parses the block Wise displays into an ordered `[{label, value}]` array stored in `payment_methods.details` (jsonb), preserving Wise's own field labels — which matters, because "Sort code" and "Routing number (for wire and ACH)" are not interchangeable to a sending bank.

The parser is a first-colon split that drops prose lines; the "Use when sending money from…" hints must never reach a client-facing invoice. `Name:` is lifted out into `account_holder_name` — the beneficiary must match the profile's GST-registered `legal_name` or the wire and the FIRC won't reconcile. Parsing runs server-side in `createPaymentMethod`; the form re-runs it client-side only to preview. Covered by `src/lib/wise.test.ts`.

Adding a currency needs no code — paste the new block. Wise has **no INR receiving details**, so INR clients stay on `bank_transfer`/`upi`.

### Earnings (what "earned" means)

`src/lib/earnings.ts` owns the roll-up, and the dashboard, payments page and any future report must go through it rather than summing columns themselves.

The rule: **the INR total is money that actually reached the bank.** It is `sum(received_amount) where received_currency = 'INR'` — never `total_amount` converted at some rate. `total_amount`/`currency` is what the client sent (500 USD); `received_amount`/`received_currency` is what landed (41,500 INR). Only the second is earnings.

Equally important: **the total is never allowed to look complete when it isn't.** `computeEarnings` returns `pending` (payments with no settlement yet) and `settledOther` (settled into a non-INR account) alongside `earnedHome`, and the UI must display them next to the figure. A payment with no settlement is reported as pending — never counted as zero, never dropped.

Billed and Outstanding stay grouped per currency via `groupByCurrency`. They are receivables; no conversion has happened, so an INR figure there would be a guess sitting next to exact numbers. They previously collapsed to a bare invoice **count** whenever more than one currency was in play — don't reintroduce that.

Settlement is a pair or nothing: migration 0013 constrains `received_amount`/`received_currency` to be both-set-or-both-null and positive, because every total filters on both being non-null — a half-filled row would vanish from earnings while still looking settled in the ledger. `computeEarnings` guards the same case in code.

Settlement can be recorded for **any** payment mode. It used to be crypto-only, which left every foreign bank transfer permanently unaccounted for.

**Three dates, because Indian compliance uses them for different things** — don't collapse them:

| Date | Column | Answers |
|---|---|---|
| Invoice raised | `invoices.issue_date` | GST return period (GSTR-1 Table 6A); accrual-basis income under s.145 |
| Client paid | `payments.payment_date` | when the client sent it |
| Rupees landed | `payments.received_date` | FIRC / e-BRC date; FEMA realisation clock; cash-basis income |

Earnings filter on `settlementDate()` = `received_date ?? payment_date`, via `inSettlementRange()`. This is what stops a client paying on 25 March whose rupees land on 5 April from booking into the wrong FY. Billed/Outstanding stay on `issue_date`, so the accrual and cash views are both available and each reconciles against the right document. The CSV export uses the same basis and includes a "Date Credited" column.

**A failed Supabase query returns `data: null`, which rolls up to a confident ₹0.00.** Both the dashboard and payments page check `.error` and render an explicit failure state instead — never total a ledger you could not read.

### Financial-year report

`/reports` — the year's shape: hero total, month-by-month columns, year-over-year change, and billed/outstanding per currency.

`src/lib/fy-report.ts` does the arithmetic and **takes its date windows as parameters** rather than importing `financial-year.ts`. Two reasons: duplicating what a financial year *is* would risk the report and the filters disagreeing about which year a payment falls in, and staying free of value imports lets it be unit-tested directly (node's test runner can't resolve the `@/` alias — `import type` is fine, it's erased).

It uses the same basis as the dashboard's Earned figure: settled INR only, dated by when the money landed. The two can never disagree. Unsettled payments and non-INR settlements are shown beside the total, never folded into it.

The chart is hand-written SVG — twelve rectangles don't justify a dependency, and it keeps the page a server component. Single series, so one hue and no legend. `#16a34a` is the one green that clears the validator's lightness band in **both** themes (0.43–0.77 light, 0.48–0.67 dark), so both modes share it. One direct label (the peak month) plus axis ticks; a table view under `<details>` for anyone not reading the chart.

**Which year is "the year" comes from the profile country.** With profiles in different countries it falls back to the calendar year, and the page states which basis it used. See the entity question in Deferred — that's the input this depends on.

### Payments ledger

A payment is a **bank event**, not an invoice field. `payments` = one row per money-in event; `payment_invoice_links` = split allocations of that payment across one or more invoices (`amount_applied`). All of it lives in `src/actions/payments.ts` (`recordPayment`, `deletePayment`, `updatePaymentSettlement`, `getOutstandingInvoices`).

- Invoice `status` is **derived** from the sum of its links: `0` → `sent`, partial → `partial`, full → `paid`. `recordPayment`/`deletePayment` recompute and write it; never set `partial` by hand.
- Cross-currency settlement: `total_amount`/`currency` is what the client sent (e.g. 500 USDC), `received_amount`/`received_currency` is what actually landed after conversion (e.g. ₹41,500 after a P2P sale). `updatePaymentSettlement` fills the second pair in later.
- `payment_records` (migration 0009) was **replaced** by `payments` + `payment_invoice_links` in 0010 and dropped. Don't reintroduce it.

### Email

`sendInvoiceEmail` in `src/actions/email.ts` renders the invoice PDF in-process with `renderToBuffer()` and sends it via **Gmail SMTP through nodemailer** — not Resend or any API-key mail service, so no domain verification is needed. Credentials are per-owner rows in `app_settings` (`gmail_user`, `gmail_app_password`), edited at `/settings`, with the app password encrypted at rest via `src/lib/token-crypto.ts`.

### Google Drive export

`/api/oauth/google` → consent → `/api/oauth/google/callback` stores the token set in `oauth_tokens` (one row per `owner_id` + `provider`), access and refresh tokens both encrypted with `token-crypto`. `src/actions/integrations.ts` then renders a PDF and uploads it, writing `drive_file_id` back onto the invoice/receipt so `removeFromDrive` can delete it later. Each business profile caches its Drive folder in `business_profiles.drive_root_folder_id` to avoid a folder lookup per upload.

`src/lib/token-crypto.ts` is AES-256-GCM, stored as `iv:authTag:ciphertext` hex. Anything token-shaped that hits the DB goes through it.

### Financial year

`src/lib/financial-year.ts` maps a **country code to its FY window** (IN/NZ Apr–Mar, AU/PK/BD/EG Jul–Jun, GB Apr 6–Apr 5, everything else calendar year). List pages filter by FY via `src/components/filters/fy-filter.tsx`. Never hardcode Apr–Mar — a profile's country drives it.

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

`overdue` is never stored — derive it everywhere as `status IN ('sent','partial') AND due_date < current_date`.

### Key types

All domain types live in `src/types/app.types.ts`: `InvoiceStatus` (`draft | sent | partial | paid | void`), `TaxType`, `PaymentMethodType`, `TemplateId`, `CurrencyCode`, `PaymentMethodSnapshot`. No generated Supabase types yet — Supabase query results are untyped, so a drift between this file and the DB enum will **not** fail `tsc`. Add generated types by running `supabase gen types`.

### Supabase client usage

- **Server Components / Route Handlers / Server Actions**: `import { createClient } from "@/lib/supabase/server"`
- **Client Components**: `import { createClient } from "@/lib/supabase/client"`
- **Middleware**: uses `createServerClient` directly from `@supabase/ssr`

### App shell and theming

`(app)/layout.tsx` is a **floating-panel shell**: the page ground shows through as a `p-2` gutter and the sidebar and main content sit on it as separate `rounded-panel` surfaces. The scroll container is `<main>`, which needs `min-h-0` — without it the flex child refuses to shrink and the inner scroll silently dies.

Radii step down as you nest: `--radius-panel` (24px) for shell surfaces, `rounded-2xl` for cards, `--radius` (10px) for controls. **Don't raise `--radius` to make cards rounder** — it feeds `rounded-lg` across all 24 shadcn components and will bloat inputs and badges too.

Elevation is `shadow-card` / `shadow-panel` / `shadow-pop`, defined per theme in `globals.css` because a light surface needs far less ink than a dark one. `--sidebar` is deliberately *lighter* than `--background` in dark mode; a darker panel reads as a hole rather than a raised sheet.

Colour transitions are scoped to interactive elements. They used to be on `*, *::before, *::after`, which put a live transition on every node in the tree — don't reintroduce that.

`SidebarContent` holds the nav and is shared by two shells: `Sidebar` (desktop rail, `hidden lg:flex`, collapsible) and `MobileNav` (`lg:hidden` — floating bottom tab bar plus a drawer behind "More"). Add a nav item to `navItems` in `sidebar-content.tsx` and every surface picks it up; `MOBILE_PRIMARY` picks which four get their own tab.

The desktop rail has **no separate toggle button** — the logo is the collapse/expand control (`onToggle` prop). In the drawer there is nothing to collapse, so the logo stays a link home.

When the rail collapses, labels **stay mounted** and are faded and cropped by the panel's `overflow-hidden`. Don't switch this to conditional rendering: unmounting reflows every row mid-animation, and keeping the text in the DOM is what lets screen readers still announce the icon-only links.

Every `(app)` route needs a `loading.tsx`. Next only prefetches a dynamic route up to its nearest loading boundary, so a route without one waits on the full RSC payload before anything paints.

### Adding shadcn/ui components

```bash
npx shadcn@latest add <component-name>
```

The project uses New York style with Neutral base color and CSS variables. Config is in `components.json`.
