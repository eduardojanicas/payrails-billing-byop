import Stripe from 'npm:stripe@20.0.0';

export async function listExistingPaymentRecordForInvoice(stripe: Stripe, invoiceId: string, stripeSecretKey: string): Promise<string | null> {
  try {
    if ((stripe as any).invoicePayments?.list) {
      const invoicePayments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
      const entries = invoicePayments?.data?.filter?.((entry: any) => entry?.payment?.type === 'payment_record') || [];
      return entries.length ? entries[0].payment.id : null;
    }

    const response = await fetch(`https://api.stripe.com/v1/invoice_payments?invoice=${encodeURIComponent(invoiceId)}`, {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    });

    if (!response.ok) return null;
    const json = await response.json();
    const entries = (json?.data || []).filter((entry: any) => entry?.payment?.type === 'payment_record');
    return entries.length ? entries[0].payment.id : null;
  } catch {
    return null;
  }
}

export async function reportPayment(params: {
  stripe: Stripe;
  paymentMethodId: string;
  customerId: string;
  amountMinor: number;
  currency: string;
  initiatedAt: number;
  completedAt: number;
  paymentReferenceId: string;
  offSession: boolean;
  succeeded: boolean;
}) {
  const outcome = params.succeeded ? 'guaranteed' : 'failed';
  return await (params.stripe as any).paymentRecords.reportPayment({
    amount_requested: { value: params.amountMinor, currency: params.currency },
    payment_method_details: { payment_method: params.paymentMethodId },
    customer_details: { customer: params.customerId },
    initiated_at: params.initiatedAt,
    customer_presence: params.offSession ? 'off_session' : 'on_session',
    processor_details: { type: 'custom', custom: { payment_reference: params.paymentReferenceId } },
    outcome,
    guaranteed: params.succeeded ? { guaranteed_at: params.completedAt } : undefined,
    failed: params.succeeded ? undefined : { failed_at: params.completedAt },
  });
}

export async function reportPaymentAttempt(
  stripe: Stripe,
  paymentRecordId: string,
  paymentMethodId: string,
  initiatedAt: number,
  completedAt: number,
  succeeded: boolean,
) {
  if (!(stripe as any).paymentRecords?.reportPaymentAttempt) return null;
  const outcome = succeeded ? 'guaranteed' : 'failed';
  return await (stripe as any).paymentRecords.reportPaymentAttempt({
    id: paymentRecordId,
    initiated_at: initiatedAt,
    payment_method_details: { payment_method: paymentMethodId },
    outcome,
    guaranteed: succeeded ? { guaranteed_at: completedAt } : undefined,
    failed: succeeded ? undefined : { failed_at: completedAt },
  });
}

export async function attachPaymentRecordToInvoice(stripe: Stripe, invoiceId: string, paymentRecordId: string, stripeSecretKey: string) {
  if ((stripe.invoices as any).attachPayment) {
    return await (stripe.invoices as any).attachPayment(invoiceId, { payment_record: paymentRecordId });
  }

  const response = await fetch(`https://api.stripe.com/v1/invoices/${encodeURIComponent(invoiceId)}/payment_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ payment_record: paymentRecordId }),
  });

  if (!response.ok) {
    throw new Error(`Failed attaching payment record: ${await response.text()}`);
  }

  return true;
}

export async function ensurePaymentRecord(params: {
  stripe: Stripe;
  stripeSecretKey: string;
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  amountMinor: number;
  currency: string;
  initiatedAt: number;
  completedAt: number;
  paymentReferenceId: string;
  succeeded: boolean;
  offSession: boolean;
}) {
  const existingId = await listExistingPaymentRecordForInvoice(params.stripe, params.invoice.id, params.stripeSecretKey);
  if (existingId) {
    await reportPaymentAttempt(params.stripe, existingId, params.paymentMethodId, params.initiatedAt, params.completedAt, params.succeeded);
    return { paymentRecordId: existingId, created: false };
  }

  const paymentRecord = await reportPayment({
    stripe: params.stripe,
    paymentMethodId: params.paymentMethodId,
    customerId: params.customerId,
    amountMinor: params.amountMinor,
    currency: params.currency,
    initiatedAt: params.initiatedAt,
    completedAt: params.completedAt,
    paymentReferenceId: params.paymentReferenceId,
    offSession: params.offSession,
    succeeded: params.succeeded,
  });

  await attachPaymentRecordToInvoice(params.stripe, params.invoice.id, paymentRecord.id, params.stripeSecretKey);
  return { paymentRecordId: paymentRecord.id, created: true };
}
