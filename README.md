# Payrails + Stripe Billing BYOP (Lovable / Vite Edition)

This project is now a standard **Vite + React** application with backend responsibilities moved to **Lovable Cloud / Supabase**:

- Frontend: React 19 + React Router + Tailwind v4
- Backend: Supabase Edge Function (`functions/api`) + Postgres + Auth + Storage
- Integrations: Payrails (mTLS + OAuth), Stripe Billing, Chargebee demo flow

## Architecture

### Frontend
- SPA routes:
  - `/`
  - `/checkout`
  - `/checkout/success`
  - `/checkout/failure`
  - `/profile`
- Providers:
  - `AuthProvider` (anonymous Supabase session bootstrap)
  - `BillingEngineProvider`
  - `SubscriptionProvider`
  - `PaymentRecordProvider`
- API client wrapper:
  - `src/api/cloudApi.ts`
  - Calls `${VITE_SUPABASE_URL}/functions/v1/api/*` with bearer token

### Backend (Supabase Edge)
- Single routed edge function: `supabase/functions/api/index.ts`
- Endpoint parity with legacy API:
  - `POST /payrails/init`
  - `POST /payrails/execution`
  - `POST /payrails/lookup`
  - `GET /payrails/instruments`
  - `DELETE /payrails/instruments/:id`
  - `POST /subscriptions`
  - `POST /stripe/record-payment`
  - `POST /stripe/payment-method/update-metadata`
  - `POST /stripe/webhook`
  - `POST /chargebee/estimate`
  - `POST /chargebee/subscriptions`
  - `POST /chargebee/record-payment`
  - `POST /chargebee/webhook`

## Database / Storage

SQL migration: `supabase/migrations/20260305130000_lovable_cloud_init.sql`

Creates:
- `profiles`
- `subscriptions`
- `payment_records`
- `processed_invoices`
- `webhook_events`

Also creates private storage bucket:
- `webhook-events`

RLS:
- User-owned tables (`profiles`, `subscriptions`, `payment_records`) scoped to `auth.uid()`.
- Internal tables (`processed_invoices`, `webhook_events`) restricted to service role.
- Storage bucket policies restricted to service role.

## Environment

Use `.env.local.example` for local frontend env and secret reference.

### Frontend (Vite)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYRAILS_ENV`
- `VITE_PAYRAILS_WORKSPACE_ID`

### Supabase Edge secrets
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

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set frontend env:
```bash
cp .env.local.example .env.local
# fill VITE_* values
```

3. Start frontend:
```bash
npm run dev
```

4. Run checks:
```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Supabase / Lovable Deployment

1. Link project and set secrets:
```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set \
  PAYRAILS_CLIENT_ID=... \
  PAYRAILS_CLIENT_SECRET=... \
  CLIENT_CERT_PEM=... \
  CLIENT_KEY_PEM=... \
  STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... \
  STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID=... \
  CHARGEBEE_SITE=... \
  CHARGEBEE_API_KEY=...
```

2. Push migration:
```bash
supabase db push
```

3. Deploy function:
```bash
supabase functions deploy api --no-verify-jwt
```

4. Configure frontend in Lovable with `VITE_*` vars and deploy.

## SPA Routing Note

When deploying outside Lovable/Supabase hosting, configure your static host to rewrite unknown paths to `index.html` so deep-link refreshes do not 404.
