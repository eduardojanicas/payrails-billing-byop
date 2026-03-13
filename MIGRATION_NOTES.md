# Migration Notes: Next.js/Vercel -> Vite/React + Lovable Cloud

## 1. Feature Inventory

### Frontend features migrated
- Next App Router pages/layout to React Router SPA.
- Next navigation (`next/link`, `next/navigation`) to `react-router-dom`.
- Next image/font usage replaced with standard `<img>` and CSS font stack.
- Client state providers preserved:
  - Billing engine selection
  - Subscription lifecycle
  - Payment record state
- Payrails UI hooks preserved and rewired to cloud endpoints.

### Backend features migrated
- All previous `app/api/*` routes moved to a single Supabase Edge Function router.
- Payrails mTLS + OAuth moved to Deno runtime using `Deno.createHttpClient({ cert, key })`.
- Stripe subscription creation, payment record reporting, metadata updates, webhook handling ported.
- Chargebee demo endpoints and webhook flow ported.
- In-memory webhook dedupe replaced by DB table (`processed_invoices`).
- Webhook payload persistence added to private Storage bucket (`webhook-events`).

### Platform/runtime features removed
- Next.js runtime and App Router server routes.
- Vercel project coupling (`.vercel` linkage).
- Next-specific build/dev config and dependencies.

## 2. Old -> New Mapping

| Old (Next/Vercel) | New (Lovable Cloud + Vite) |
|---|---|
| Next App Router pages/layout | React Router SPA with `src/App.tsx` + `src/layouts/AppShell.tsx` |
| `app/api/*` route handlers | `supabase/functions/api/index.ts` routed handlers |
| `NextResponse` JSON helpers | Standard `Response` helpers in `supabase/functions/_shared/json.ts` |
| Node `https.Agent` mTLS | Deno `Deno.createHttpClient({ cert, key })` |
| In-memory `processedInvoices` set | Postgres table `processed_invoices` |
| sessionStorage-only payment/subscription state | sessionStorage + durable `subscriptions` / `payment_records` rows |
| `next/link`, `next/navigation`, `next/image`, `next/font` | `react-router-dom`, `<img>`, CSS-based font stack |
| Vercel linked project metadata | Supabase/Lovable `config.toml`, migrations, edge functions |

## 3. Endpoint Mapping

| Legacy Endpoint | New Edge Route |
|---|---|
| `POST /api/payrails/init` | `POST /functions/v1/api/payrails/init` |
| `POST /api/payrails/execution` | `POST /functions/v1/api/payrails/execution` |
| `POST /api/payrails/lookup` | `POST /functions/v1/api/payrails/lookup` |
| `GET /api/payrails/instruments` | `GET /functions/v1/api/payrails/instruments` |
| `DELETE /api/payrails/instruments/:id` | `DELETE /functions/v1/api/payrails/instruments/:id` |
| `POST /api/subscriptions` | `POST /functions/v1/api/subscriptions` |
| `POST /api/stripe/record-payment` | `POST /functions/v1/api/stripe/record-payment` |
| `POST /api/stripe/payment-method/update-metadata` | `POST /functions/v1/api/stripe/payment-method/update-metadata` |
| `POST /api/stripe/webhook` | `POST /functions/v1/api/stripe/webhook` |
| `POST /api/chargebee/estimate` | `POST /functions/v1/api/chargebee/estimate` |
| `POST /api/chargebee/subscriptions` | `POST /functions/v1/api/chargebee/subscriptions` |
| `POST /api/chargebee/record-payment` | `POST /functions/v1/api/chargebee/record-payment` |
| `POST /api/chargebee/webhook` | `POST /functions/v1/api/chargebee/webhook` |

## 4. Auth / DB / Storage

### Auth
- Added anonymous Supabase auth bootstrap in frontend (`AuthProvider`).
- Edge function validates bearer JWT for client-invoked routes.
- Webhook endpoints are signature/config validated and do not require user JWT.

### Database
- Added migration creating:
  - `profiles`
  - `subscriptions`
  - `payment_records`
  - `processed_invoices`
  - `webhook_events`
- Added RLS for user-owned and service-role-only tables.

### Storage
- Added private bucket: `webhook-events`.
- Stripe/Chargebee webhook payload snapshots are uploaded there.
- Policies are service-role only.

## 5. Environment Migration

### Replaced public env names
- `NEXT_PUBLIC_PAYRAILS_ENV` -> `VITE_PAYRAILS_ENV`
- `NEXT_PUBLIC_BASE_URL` removed (no internal self-calls)

### Added frontend env
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYRAILS_ENV`
- `VITE_PAYRAILS_WORKSPACE_ID`

### Edge secrets
- `PAYRAILS_CLIENT_ID`
- `PAYRAILS_CLIENT_SECRET`
- `CLIENT_CERT_PEM`
- `CLIENT_KEY_PEM`
- `PAYRAILS_BASE_URL`
- `PAYRAILS_WORKFLOW_CODE`
- `PAYRAILS_ENV`
- `PAYRAILS_WORKSPACE_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID`
- `CHARGEBEE_SITE`
- `CHARGEBEE_API_KEY`
- `CHARGEBEE_BASE_URL`

## 6. Local Run Instructions

1. Install dependencies
```bash
npm install
```

2. Configure frontend env
```bash
cp .env.local.example .env.local
# set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + optional VITE_PAYRAILS_*
```

3. Run app
```bash
npm run dev
```

4. Build and preview
```bash
npm run build
npm run preview
```

5. Quality checks
```bash
npm run typecheck
npm run lint
```

6. Backend deploy flow (Supabase/Lovable)
```bash
supabase db push
supabase functions deploy api --no-verify-jwt
```

## 7. Assumptions, Tradeoffs, and Intentional Changes

1. Anonymous auth is used to preserve frictionless UX while enabling RLS and per-user ownership.
2. Function-level JWT verification is disabled (`verify_jwt = false`) to support unauthenticated webhooks; user auth is enforced at route level for client endpoints.
3. Chargebee integration remains optional and returns explicit config errors when secrets are absent.
4. Webhook payload archival in Storage was added intentionally for observability/audit parity improvement.
5. Subscription/payment records now include durable DB rows in addition to session state.

## 8. Known Compatibility Notes

1. Frontend route contract remains unchanged from user perspective.
2. API responses preserve original fields used by the UI; additive fields (`id`, `userId`) were added.
3. Deep-link refresh compatibility depends on host SPA rewrite to `index.html`.
