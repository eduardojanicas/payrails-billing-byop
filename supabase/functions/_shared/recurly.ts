// Recurly REST API v2021-02-25 thin wrapper
// Uses fetch directly — no SDK needed.

import { runtimeEnv } from './env.ts';

const API_VERSION = 'v2021-02-25';
const BASE_URL = 'https://v3.eu.recurly.com';

function headers(apiKey: string): Record<string, string> {
  const encoded = btoa(`${apiKey}:`);
  return {
    Authorization: `Basic ${encoded}`,
    Accept: `application/vnd.recurly.${API_VERSION}`,
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json',
  };
}

async function recurlyFetch<T = any>(path: string, method: string, body?: unknown): Promise<T> {
  const apiKey = runtimeEnv.RECURLY_API_KEY;
  if (!apiKey) throw new Error('RECURLY_API_KEY not configured');

  const opts: RequestInit = {
    method,
    headers: headers(apiKey),
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Recurly ${method} ${path} failed (${res.status}): ${text}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function createAccount(params: { code: string; email: string; holderReference: string }): Promise<any> {
  return recurlyFetch('/accounts', 'POST', {
    code: params.code,
    username: params.holderReference,
    email: params.email,
    first_name: 'John',
    last_name: 'Doe',
  });
}

export async function createSubscription(params: {
  accountCode: string;
  planCode: string;
  currency: string;
}): Promise<any> {
  return recurlyFetch('/subscriptions', 'POST', {
    plan_code: params.planCode,
    account: { code: params.accountCode },
    currency: params.currency,
    collection_method: 'manual',
    net_terms: 0,
  });
}

export async function recordExternalTransaction(params: {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  succeeded: boolean;
  description?: string;
}): Promise<any> {
  if (!params.succeeded) {
    return {
      skipped: true,
      reason: 'recurly_record_external_transaction_only_supports_successful_payments',
    };
  }

  const amountDecimal = params.amountMinor / 100;
  return recurlyFetch(`/invoices/${encodeURIComponent(params.invoiceNumber)}/transactions`, 'POST', {
    amount: amountDecimal,
    payment_method: 'paypal',
    description: params.description || 'Payrails payment',
  });
}

export async function getSubscription(subscriptionId: string): Promise<any> {
  return recurlyFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, 'GET');
}

export async function getAccount(accountCode: string): Promise<any> {
  return recurlyFetch(`/accounts/${encodeURIComponent(accountCode)}`, 'GET');
}

export function hasRecurlyConfigured(): boolean {
  return !!runtimeEnv.RECURLY_API_KEY;
}
