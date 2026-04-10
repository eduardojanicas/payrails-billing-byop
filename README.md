# Payrails Billing Integration - Reference Implementation

This reference implementation demonstrates how to integrate **Payrails** with your existing billing provider (Stripe Billing, Chargebee, or Recurly) to process subscription payments. Use this as a starting point for building your own billing integration or as a reference for best practices.

## Overview

This project provides a complete end-to-end example of:

- **Payment collection via Payrails** - Securely collect card and PayPal payments using the Payrails Web SDK
- **Subscription management** - Create and manage subscriptions with Stripe Billing, Chargebee, or Recurly
- **Webhook handling** - Process billing events and record payments automatically
- **Stored payment instruments** - Allow customers to save and manage their payment methods

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Backend | Supabase Edge Functions |
| Database | Supabase (PostgreSQL) |
| Payments | Payrails |
| Billing | Stripe Billing, Chargebee, or Recurly |

## Prerequisites

Before getting started, ensure you have:

- A **Payrails** account with API credentials (client ID, client secret, mTLS certificates)
- A **Stripe**, **Chargebee**, or **Recurly** account with API keys
- A **Supabase** project (free tier is sufficient for testing)
- Node.js 18+ and npm installed locally

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd payrails-billing-byop
npm install
```

### 2. Configure Environment

Create a `.env.local` file with your frontend configuration:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PAYRAILS_ENV=sandbox
VITE_PAYRAILS_WORKSPACE_ID=your-workspace-id
```

### 3. Run Locally

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## Deployment

### Setting Up Supabase

1. **Install the Supabase CLI** and authenticate:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

2. **Configure secrets** in your Supabase project:

```bash
supabase secrets set \
  PAYRAILS_CLIENT_ID="your-client-id" \
  PAYRAILS_CLIENT_SECRET="your-client-secret" \
  CLIENT_CERT_PEM="-----BEGIN CERTIFICATE-----..." \
  CLIENT_KEY_PEM="-----BEGIN PRIVATE KEY-----..." \
  PAYRAILS_BASE_URL="https://api.payrails.io" \
  PAYRAILS_WORKFLOW_CODE="your-workflow-code" \
  PAYRAILS_ENV="sandbox" \
  PAYRAILS_WORKSPACE_ID="your-workspace-id" \
  STRIPE_SECRET_KEY="sk_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..."
```

For Chargebee, also set:
```bash
supabase secrets set \
  CHARGEBEE_SITE="your-site" \
  CHARGEBEE_API_KEY="your-api-key" \
  CHARGEBEE_BASE_URL="https://your-site.chargebee.com"
```

For Recurly, also set:
```bash
supabase secrets set \
  RECURLY_API_KEY="your-recurly-api-key" \
  RECURLY_SUBDOMAIN="your-recurly-subdomain"
```

3. **Deploy the database schema**:

```bash
supabase db push
```

4. **Deploy the edge functions**:

```bash
supabase functions deploy api --no-verify-jwt
```

### Configuring Webhooks

Set up webhook endpoints in your billing provider to point to your deployed function:

- **Stripe**: `https://your-project.supabase.co/functions/v1/api/stripe/webhook`
- **Chargebee**: `https://your-project.supabase.co/functions/v1/api/chargebee/webhook`
- **Recurly**: `https://your-project.supabase.co/functions/v1/api/recurly/webhook`

## Project Structure

```
├── src/
│   ├── checkout/          # Checkout flow components
│   ├── profile/           # Customer profile & saved instruments
│   ├── context/           # React context providers (Auth, Billing, Subscription, Payment)
│   ├── providers/         # AuthProvider (Supabase anonymous sessions)
│   ├── api/               # API client (cloudApi wrapper)
│   ├── hooks/             # Payrails SDK integration hooks (Elements, Drop-in)
│   │   └── shared/        # Mount guard utilities (StrictMode safety)
│   ├── utils/             # Shared utilities (logger, currency, payment redirect, instrument resolution)
│   ├── layouts/           # App shell layout
│   └── payrails-theme.css # Payrails SDK styling (card form, buttons, states)
├── supabase/
│   ├── functions/
│   │   ├── api/           # Edge function (Hono router, all API endpoints)
│   │   └── _shared/       # Shared backend modules (env, auth, db, payrails, logger, currency)
│   └── migrations/        # Database schema & RLS policies
```

## Customization

### Adapting for Your Use Case

This reference implementation is designed to be customized:

1. **Products & Pricing** - Update the product definitions in `src/checkout/page.tsx`
2. **Checkout Flow** - Modify the checkout components in `src/checkout/`
3. **Card Form Styling** - The Payrails card form accepts inline styles via the `styles` option in `usePayrailsElements` (for iframe-rendered fields) and CSS overrides in `src/payrails-theme.css` (for surrounding elements)
4. **Payment Button Styling** - Post-mount class overrides in `usePayrailsElements` use design token classes (`bg-primary`, `text-primary-foreground`) for consistency with your theme
5. **Billing Engine** - Switch between Stripe, Chargebee, and Recurly at runtime via the Profile page or `BillingEngineProvider`
6. **API Endpoints** - Extend `supabase/functions/api/` for additional business logic

### Database Schema

The included migration creates tables for:
- `profiles` - Customer information
- `subscriptions` - Subscription records
- `payment_records` - Payment history
- `processed_invoices` - Webhook deduplication
- `webhook_events` - Event logging

All tables include Row Level Security (RLS) policies.

## API Reference

The backend exposes these endpoints:

| Endpoint | Description |
|----------|-------------|
| `POST /payrails/init` | Initialize a Payrails session |
| `POST /payrails/execution` | Execute a payment |
| `GET /payrails/instruments` | List saved payment methods |
| `DELETE /payrails/instruments/:id` | Remove a saved payment method |
| `POST /subscriptions` | Create a Stripe subscription |
| `POST /stripe/record-payment` | Record a payment in Stripe |
| `POST /stripe/payment-method/update-metadata` | Update Stripe payment method metadata |
| `POST /stripe/webhook` | Handle Stripe webhook events |
| `POST /chargebee/subscriptions` | Create a Chargebee subscription |
| `POST /chargebee/estimate` | Fetch a Chargebee billing estimate |
| `POST /chargebee/record-payment` | Record a payment in Chargebee |
| `POST /chargebee/webhook` | Handle Chargebee webhook events |
| `POST /recurly/subscriptions` | Create a Recurly subscription |
| `POST /recurly/record-payment` | Record a payment in Recurly |
| `POST /recurly/webhook` | Handle Recurly webhook events |

## Support

For questions about this reference implementation or Payrails integration:

- **Payrails Documentation**: https://docs.payrails.com
- **Contact your Payrails representative** for implementation support

---

*This is a reference implementation provided by Payrails. Customize and adapt it to meet your specific requirements.*
