// Shared Payrails type definitions to improve clarity across server routes & hooks.

export interface PayrailsAmountMinor {
  value: string; // minor units string (e.g. '1099')
  currency: string; // ISO 4217 uppercase
}

export interface PayrailsInitPayload {
  amount: PayrailsAmountMinor;
  type: 'dropIn' | string;
  workflowCode: string; // e.g. 'payment-acceptance'
  merchantReference: string;
  holderReference: string;
  workspaceId?: string;
  meta?: Record<string, unknown>;
}

export interface PayrailsExecutionAction {
  action: 'lookup' | 'startPaymentSession' | 'authorize' | string;
  method: 'POST' | 'GET' | string;
  body: Record<string, any>;
}

export interface PayrailsExecutionPayload {
  initialActions: PayrailsExecutionAction[];
  merchantReference: string;
  holderReference: string;
  workspaceId?: string;
}

export interface PayrailsLookupPayload {
  amount: PayrailsAmountMinor;
  meta: Record<string, any>;
}

export interface PaymentInstrumentMeta {
  paymentInstrumentId?: string;
  paymentMethodCode?: string; // 'card', 'paypal', etc.
}
