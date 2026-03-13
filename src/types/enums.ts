// Central enumerations for workflow/action/payment method codes.
// Avoid scattering magic strings; update here when introducing new flows.

export enum WorkflowCode {
  PaymentAcceptance = 'payment-acceptance',
  // Add future workflow codes here
}

export enum PaymentMethodCode {
  Card = 'card',
  GooglePay = 'googlePay',
  ApplePay = 'applePay',
  PayPal = 'paypal',
}

export enum ExecutionAction {
  Lookup = 'lookup',
  StartPaymentSession = 'startPaymentSession',
  Authorize = 'authorize',
}

export const DEFAULT_WORKFLOW = WorkflowCode.PaymentAcceptance;
export const DEFAULT_PAYMENT_METHOD = PaymentMethodCode.Card;
