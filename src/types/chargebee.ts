// chargebee.ts
// ---------------------------------------------------------------------------
// Small set of illustrative Chargebee-related types for the demo integration.

export interface ChargebeeEstimateResponse {
  itemPriceId: string;
  amountMinor: number; // minor units
  currency: string;
  estimateReference: string;
}

export interface ChargebeeSubscriptionResponse {
  customer: { id: string; email?: string };
  subscription: { id: string };
  invoiceId: string;
  holderReference: string;
  amount: string; // minor units as string (parity with Stripe route)
  currency: string;
  email?: string;
}

export interface ChargebeeRecordPaymentResponse {
  paymentRecordId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  reference: string;
  status: string; // e.g. 'paid'
  successAt: number;
}
