import { Hono } from 'npm:hono@4.10.2';
import Stripe from 'npm:stripe@20.0.0';
import Chargebee from 'npm:chargebee@3.16.0';
import { badRequest, corsPreflight, json, notFound, serverError, unauthorized, upstreamError } from '../_shared/json.ts';
import { createLogger } from '../_shared/logger.ts';
import { runtimeEnv, hasChargebeeConfigured, hasStripeConfigured, hasRecurlyConfigured } from '../_shared/env.ts';
import { fetchAccessToken, payrailsJson } from '../_shared/payrails.ts';
import { ensurePaymentRecord, attachPaymentRecordToInvoice } from '../_shared/stripePaymentRecords.ts';
import { isValidCurrency, normalizeCurrency } from '../_shared/currency.ts';
import { requireUser } from '../_shared/auth.ts';
import { insertWebhookEvent, isInvoiceProcessed, markInvoiceProcessed, persistWebhookPayload, serviceClient } from '../_shared/db.ts';

const app = new Hono().basePath('/api');

app.options('*', () => corsPreflight());

function parseTimestamp(input: string | number | undefined): number | undefined {
  if (input === undefined) return undefined;
  if (typeof input === 'number') {
    return input > 10_000_000_000 ? Math.floor(input / 1000) : input;
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor(date.getTime() / 1000);
}

function getStripeClient(apiVersion: string = '2025-11-17.clover'): Stripe | null {
  if (!runtimeEnv.STRIPE_SECRET_KEY) return null;
  return new Stripe(runtimeEnv.STRIPE_SECRET_KEY, { apiVersion: apiVersion as any });
}

function getChargebeeClient(): any | null {
  if (!hasChargebeeConfigured()) return null;
  const site = runtimeEnv.CHARGEBEE_SITE || runtimeEnv.CHARGEBEE_BASE_URL?.replace(/^https?:\/\/(.+?)\.chargebee\.com.*$/, '$1');
  if (!site || !runtimeEnv.CHARGEBEE_API_KEY) return null;
  return new Chargebee({
    site,
    apiKey: runtimeEnv.CHARGEBEE_API_KEY,
  });
}

function buildInitPayload(params: {
  amount: number;
  currency: string;
  holderReference: string;
  invoiceId?: string;
  merchantReference: string;
}) {
  return {
    amount: { value: String(params.amount), currency: params.currency.toUpperCase() },
    type: 'dropIn',
    workflowCode: runtimeEnv.PAYRAILS_WORKFLOW_CODE,
    merchantReference: params.merchantReference,
    holderReference: params.holderReference,
    workspaceId: runtimeEnv.PAYRAILS_WORKSPACE_ID,
    ...(params.invoiceId ? { meta: { order: { reference: params.invoiceId } } } : {}),
  };
}

function buildExecutionPayload(params: {
  amountMinor: number;
  currency: string;
  holderReference: string;
  merchantReference: string;
  paymentInstrumentId: string;
  invoiceId?: string;
}) {
  const amountObj = { value: String(params.amountMinor), currency: params.currency.toUpperCase() };
  const meta = params.invoiceId ? { order: { reference: params.invoiceId } } : undefined;

  return {
    initialActions: [
      {
        action: 'startPaymentSession',
        method: 'POST',
        body: {
          integrationType: 'api',
          amount: amountObj,
          ...(meta ? { meta } : {}),
        },
      },
      {
        action: 'authorize',
        method: 'POST',
        body: {
          amount: amountObj,
          returnInfo: {
            success: 'payrails.com/success',
            cancel: 'payrails.com/failure',
            error: 'payrails.com/error',
            pending: 'payrails.com/pending',
          },
          paymentComposition: [
            {
              paymentInstrumentId: params.paymentInstrumentId,
              PaymentMethodCode: 'card',
              integrationType: 'api',
              amount: amountObj,
              ...(meta ? { meta } : {}),
            },
          ],
        },
      },
    ],
    merchantReference: params.merchantReference,
    holderReference: params.holderReference,
    workspaceId: runtimeEnv.PAYRAILS_WORKSPACE_ID,
  };
}

function buildLookupPayload(params: {
  amountMinor: number;
  currency: string;
  email: string;
  billingAddress: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}) {
  return {
    amount: { value: String(params.amountMinor), currency: params.currency.toUpperCase() },
    meta: {
      customer: { email: params.email },
      order: { billingAddress: { ...params.billingAddress } },
    },
  };
}

function collectStatusCodes(node: unknown, out: string[] = []): string[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectStatusCodes(item, out);
    return out;
  }
  if (typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (typeof rec.code === 'string') out.push(rec.code);
    for (const value of Object.values(rec)) collectStatusCodes(value, out);
  }
  return out;
}

function resolveAuthorizationOutcome(execution: any): { outcome: 'succeeded' | 'failed' | 'pending'; code?: string } {
  const codes = collectStatusCodes(execution?.status).map((c) => c.toLowerCase());
  const match = (needles: string[]) => codes.find((c) => needles.includes(c));
  const success = match(['authorizesuccessful', 'authorize_successful']);
  if (success) return { outcome: 'succeeded', code: success };
  const failed = match(['authorizefailed', 'authorize_failed', 'authorizationfailed', 'declined', 'refused', 'failed', 'error', 'cancelled', 'canceled']);
  if (failed) return { outcome: 'failed', code: failed };
  return { outcome: 'pending', code: codes[0] };
}

async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollExecutionAuthorization(executionId: string, logger: ReturnType<typeof createLogger>) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
      const execution = await payrailsJson<any>({
        path: `/merchant/workflows/${encodeURIComponent(runtimeEnv.PAYRAILS_WORKFLOW_CODE)}/executions/${encodeURIComponent(executionId)}`,
        method: 'GET',
        token,
      });
      const { outcome, code } = resolveAuthorizationOutcome(execution);
      logger.debug('Polled Payrails execution status', { executionId, attempt, outcome, code });
      if (outcome === 'succeeded') return { succeeded: true, code };
      if (outcome === 'failed') return { succeeded: false, code };
    } catch (error) {
      logger.warn('Execution status poll failed', {
        executionId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (attempt < 6) await sleep(1500);
  }
  return { succeeded: false };
}

async function executePayrailsWorkflow(input: {
  amount: number;
  currency: string;
  invoiceId: string;
  holderReference?: string;
  merchantReference?: string;
  paymentInstrumentId?: string;
}, logger: ReturnType<typeof createLogger>): Promise<{ succeeded: boolean; referenceId: string }> {
  const holderReference = input.holderReference || 'holder-unknown';
  const merchantReference = input.merchantReference || input.invoiceId || `order-${crypto.randomUUID()}`;
  const paymentInstrumentId = input.paymentInstrumentId || 'instrument-unknown';

  const payload = buildExecutionPayload({
    amountMinor: input.amount,
    currency: input.currency,
    invoiceId: input.invoiceId,
    holderReference,
    merchantReference,
    paymentInstrumentId,
  });

  const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
  const execution = await payrailsJson<any>({
    path: `/merchant/workflows/${runtimeEnv.PAYRAILS_WORKFLOW_CODE}/executions`,
    method: 'POST',
    token,
    payload,
  });

  const executionId = execution?.id as string | undefined;
  const immediate = resolveAuthorizationOutcome(execution);

  if (immediate.outcome === 'succeeded') {
    return { succeeded: true, referenceId: executionId || merchantReference };
  }
  if (immediate.outcome === 'failed') {
    return { succeeded: false, referenceId: executionId || merchantReference };
  }

  if (!executionId) {
    logger.warn('Execution returned pending state without id', execution);
    return { succeeded: false, referenceId: merchantReference };
  }

  const polled = await pollExecutionAuthorization(executionId, logger);
  return { succeeded: polled.succeeded, referenceId: executionId };
}

app.get('/health', () => json({ ok: true, ts: new Date().toISOString() }));

app.post('/payrails/init', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  const correlationId = c.req.header('x-correlation-id') || c.req.header('x-request-id') || crypto.randomUUID();
  const logger = createLogger({ route: '/payrails/init', correlationId, userId: user.id });

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const amount = typeof body.amount === 'number' ? body.amount : 0;
  const currencyRaw = typeof body.currency === 'string' ? body.currency : 'USD';
  const currency = isValidCurrency(currencyRaw) ? normalizeCurrency(currencyRaw) : 'USD';
  const holderReference = body.holderReference || `tp_${crypto.randomUUID()}`;
  const invoiceId = body.invoiceId || undefined;
  const merchantReference = body.merchantReference || `order-${crypto.randomUUID()}`;

  if (!isValidCurrency(currency)) {
    return badRequest('Invalid currency code');
  }

  try {
    const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
    const payload = buildInitPayload({ amount, currency, holderReference, invoiceId, merchantReference });
    const config = await payrailsJson<any>({
      path: '/merchant/client/init',
      method: 'POST',
      token,
      payload,
    });

    logger.info('Payrails init succeeded', { holderReference, invoiceId, merchantReference });
    return json({ ...config, environment: runtimeEnv.PAYRAILS_ENV, holderReference, invoiceId, merchantReference });
  } catch (error) {
    logger.error('Init route error', error);
    return serverError('Init route exception', error instanceof Error ? error.message : String(error));
  }
});

app.post('/payrails/execution', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return badRequest('Invalid body (amount:number, currency:string required)');
  }

  if (!body || typeof body.amount !== 'number' || !body.currency) {
    return badRequest('Invalid body (amount:number, currency:string required)');
  }

  if (!isValidCurrency(body.currency)) {
    return badRequest('Invalid currency format');
  }

  const correlationId = c.req.header('x-correlation-id') || c.req.header('x-request-id') || crypto.randomUUID();
  const logger = createLogger({ route: '/payrails/execution', correlationId, userId: user.id });

  const payload = buildExecutionPayload({
    amountMinor: body.amount,
    currency: normalizeCurrency(body.currency),
    invoiceId: body.invoiceId,
    holderReference: body.holderReference || 'holder-unknown',
    merchantReference: body.merchantReference || body.invoiceId || `order-${crypto.randomUUID()}`,
    paymentInstrumentId: body.paymentInstrumentId || 'instrument-unknown',
  });

  try {
    const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
    const execution = await payrailsJson<any>({
      path: `/merchant/workflows/${runtimeEnv.PAYRAILS_WORKFLOW_CODE}/executions`,
      method: 'POST',
      token,
      payload,
    });
    logger.info('Execution created', { executionId: execution?.id });
    return json({ execution });
  } catch (error) {
    logger.error('Execution route error', error);
    return serverError('Execution route exception', error instanceof Error ? error.message : String(error));
  }
});

app.post('/payrails/lookup', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  let body: any;
  try {
    body = await c.req.json();
  } catch (error) {
    return badRequest('Invalid JSON body', error instanceof Error ? error.message : String(error));
  }

  const { workflowCode, executionId, customer, order, amount } = body || {};
  if (!workflowCode || typeof workflowCode !== 'string') return badRequest('workflowCode required');
  if (!executionId || typeof executionId !== 'string') return badRequest('executionId required');
  if (!customer?.email) return badRequest('customer.email required');
  if (!amount?.value || typeof amount.value !== 'number') return badRequest('amount.value required');
  if (!amount?.currency) return badRequest('amount.currency required');
  if (!isValidCurrency(amount.currency)) return badRequest('Invalid amount.currency');
  if (!order?.billingAddress) return badRequest('billingAddress required');

  const lookupPayload = buildLookupPayload({
    amountMinor: amount.value,
    currency: normalizeCurrency(amount.currency),
    email: customer.email,
    billingAddress: {
      street: order.billingAddress?.street,
      city: order.billingAddress?.city,
      state: order.billingAddress?.state,
      postalCode: order.billingAddress?.postalCode,
    },
  });

  try {
    const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
    const result = await payrailsJson({
      path: `/merchant/workflows/${workflowCode}/executions/${executionId}/lookup`,
      method: 'POST',
      token,
      payload: lookupPayload,
    });
    return json(result);
  } catch (error) {
    return upstreamError('Lookup failed', error instanceof Error ? error.message : String(error));
  }
});

app.get('/payrails/instruments', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  const holderReference = c.req.query('holderReference') || undefined;
  try {
    const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
    const path = `/payment/instruments${holderReference ? `?filter[holderReference]=${encodeURIComponent(holderReference)}` : ''}`;
    const result = await payrailsJson<any>({ path, method: 'GET', token });
    const instruments = Array.isArray(result.results) ? result.results : [];
    return json({ instruments });
  } catch (error) {
    return serverError('Instruments route error', error instanceof Error ? error.message : String(error));
  }
});

app.delete('/payrails/instruments/:id', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  const instrumentId = c.req.param('id');
  if (!instrumentId) {
    return badRequest('Missing instrument id');
  }

  try {
    const token = await fetchAccessToken(runtimeEnv.PAYRAILS_BASE_URL);
    try {
      await payrailsJson({
        path: `/payment/instruments/${encodeURIComponent(instrumentId)}`,
        method: 'DELETE',
        token,
        payload: {},
      });
      return json({ deleted: true, id: instrumentId });
    } catch (inner) {
      const message = inner instanceof Error ? inner.message : String(inner);
      if (/\(404\)/.test(message) || /not found/i.test(message)) {
        return notFound('Instrument not found', { id: instrumentId });
      }
      return upstreamError('Deletion failed', message);
    }
  } catch (error) {
    return serverError('Instrument delete error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/subscriptions', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  if (!hasStripeConfigured()) {
    return serverError('Stripe not configured');
  }

  const stripe = getStripeClient();
  if (!stripe) return serverError('Stripe not configured');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const existingCustomerId = body.customerId;
  const holderReference = body.holderReference;
  const email = body.email;

  if (!holderReference) return badRequest('Missing holderReference');
  if (!existingCustomerId) {
    if (!email) return badRequest('Missing email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return badRequest('Invalid email format');
  }

  const amountMinor = body.amountMinor ?? 2500;
  const currencyInput = body.currency || 'USD';
  const currency = isValidCurrency(currencyInput) ? normalizeCurrency(currencyInput) : 'USD';
  const interval = body.interval || 'month';

  try {
    const customer = existingCustomerId
      ? await stripe.customers.retrieve(existingCustomerId)
      : await stripe.customers.create({
          description: 'John Doe - Payrails BYOP Customer',
          email,
          metadata: { holderReference },
        });

    const product = await stripe.products.create({
      name: 'Subscription Plan',
      description: 'Autogenerated plan from checkout authorize success',
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountMinor,
      currency,
      recurring: { interval },
    });

    const subscription = await stripe.subscriptions.create({
      customer: (customer as Stripe.Customer).id,
      items: [{ price: price.id }],
      description: 'Payrails BYOP',
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        source: 'payrails-authorize-success',
        holderReference,
      },
      expand: ['latest_invoice'],
    });

    const invoiceId = typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : (subscription.latest_invoice as Stripe.Invoice | null)?.id;

    const insertPayload = {
      user_id: user.id,
      engine: 'stripe',
      holder_reference: holderReference,
      customer_id: (customer as Stripe.Customer).id,
      subscription_id: subscription.id,
      invoice_id: invoiceId || null,
      amount: String(price.unit_amount),
      currency,
      email: (customer as Stripe.Customer).email,
      payload: { productId: product.id, priceId: price.id },
    };

    const { data: inserted } = await serviceClient
      .from('subscriptions')
      .insert(insertPayload)
      .select('id')
      .single();

    return json({
      id: inserted?.id,
      subscription,
      product,
      price,
      customer,
      amount: String(price.unit_amount),
      currency,
      holderReference,
      email: (customer as Stripe.Customer).email,
      invoiceId,
      userId: user.id,
    });
  } catch (error) {
    return serverError('Unknown Stripe error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/stripe/record-payment', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  const stripe = getStripeClient();
  if (!stripe || !runtimeEnv.STRIPE_SECRET_KEY) return serverError('Stripe not configured');
  if (!runtimeEnv.STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID) {
    return serverError('Missing STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID');
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { invoiceId, instrumentId, customerId, amount, currency, successAt, initiatedAt, subscriptionId } = body;

  const errors: string[] = [];
  if (!invoiceId) errors.push('invoiceId required');
  if (!instrumentId) errors.push('instrumentId required');
  if (!customerId) errors.push('customerId required');
  if (typeof amount !== 'number' || amount <= 0) errors.push('amount must be positive number (minor units)');
  if (!currency) errors.push('currency required');
  if (!successAt) errors.push('successAt required');
  if (errors.length) return badRequest('Validation failed', errors);

  const currencyNorm = isValidCurrency(currency) ? normalizeCurrency(currency) : 'USD';
  const successTs = parseTimestamp(successAt)!;
  const initiatedTs = parseTimestamp(initiatedAt) || successTs;

  try {
    const paymentMethod = await (stripe.paymentMethods.create as any)({
      type: 'custom',
      custom: { type: runtimeEnv.STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID },
      metadata: { payrails_instrument_id: instrumentId },
    });

    await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });

    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethod.id });
    }

    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod.id } });

    const { paymentRecordId } = await ensurePaymentRecord({
      stripe,
      stripeSecretKey: runtimeEnv.STRIPE_SECRET_KEY,
      invoice: { id: invoiceId } as Stripe.Invoice,
      paymentMethodId: paymentMethod.id,
      customerId,
      amountMinor: amount,
      currency: currencyNorm,
      initiatedAt: initiatedTs,
      completedAt: successTs,
      paymentReferenceId: instrumentId,
      succeeded: true,
      offSession: false,
    });

    try {
      await attachPaymentRecordToInvoice(stripe, invoiceId, paymentRecordId, runtimeEnv.STRIPE_SECRET_KEY);
    } catch {
      // no-op: ensurePaymentRecord already tries attaching
    }

    const { data: inserted } = await serviceClient.from('payment_records').insert({
      user_id: user.id,
      engine: 'stripe',
      payment_record_id: paymentRecordId,
      invoice_id: invoiceId,
      payment_method_id: paymentMethod.id,
      customer_id: customerId,
      subscription_id: subscriptionId || null,
      amount_minor: amount,
      currency: currencyNorm,
      status: 'succeeded',
      payload: {
        initiatedAt: initiatedTs,
        successAt: successTs,
        instrumentId,
      },
    }).select('id').single();

    return json({
      id: inserted?.id,
      userId: user.id,
      invoiceId,
      paymentMethodId: paymentMethod.id,
      paymentRecordId,
      customerId,
      subscriptionId: subscriptionId || null,
      amount,
      currency: currencyNorm,
      successAt: successTs,
      initiatedAt: initiatedTs,
    });
  } catch (error) {
    return serverError('Stripe error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/stripe/payment-method/update-metadata', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  const stripe = getStripeClient();
  if (!stripe) return serverError('Stripe not configured');

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { customerId, subscriptionId, instrumentId, paymentMethodId } = body;
  const errors: string[] = [];
  if (!customerId) errors.push('customerId required');
  if (!instrumentId) errors.push('instrumentId required');
  if (errors.length) return badRequest('Validation failed', errors);

  try {
    let pmId = paymentMethodId;

    if (!pmId && subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        pmId = (sub.default_payment_method as string) || undefined;
      } catch {
        // ignore and fallback to customer lookup
      }
    }

    if (!pmId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer || (customer as any).deleted) {
        return notFound('Customer not found');
      }
      pmId = (customer as Stripe.Customer).invoice_settings?.default_payment_method as string | undefined;
    }

    if (!pmId) {
      return badRequest('No payment method resolved (provide paymentMethodId or ensure default on subscription/customer).');
    }

    const updated = await stripe.paymentMethods.update(pmId, {
      metadata: { payrails_instrument_id: instrumentId },
    });

    return json({ ok: true, paymentMethodId: pmId, metadata: updated.metadata });
  } catch (error) {
    return serverError('Stripe error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/stripe/webhook', async (c) => {
  const stripe = getStripeClient('2025-09-30.preview');
  if (!stripe || !runtimeEnv.STRIPE_SECRET_KEY) return serverError('Stripe not configured');
  if (!runtimeEnv.STRIPE_WEBHOOK_SECRET) return serverError('Missing STRIPE_WEBHOOK_SECRET');

  const rawBody = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return badRequest('Missing stripe-signature header');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, runtimeEnv.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return badRequest('Signature verification failed', error instanceof Error ? error.message : String(error));
  }

  const payloadPath = await persistWebhookPayload('stripe', event.id || crypto.randomUUID(), rawBody);
  await insertWebhookEvent({
    source: 'stripe',
    eventId: event.id,
    eventType: event.type,
    payloadPath,
    status: 'received',
  });

  if (event.type === 'invoice.payment_attempt_required') {
    const invoiceId = (event.data.object as Stripe.Invoice).id;
    if (await isInvoiceProcessed(invoiceId)) {
      return json({ received: true, type: event.type, duplicate: true });
    }

    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
        await markInvoiceProcessed(invoiceId, 'stripe', { reason: 'no_amount_remaining' });
        return json({ received: true, type: event.type, skipped: true });
      }

      let defaultPmId = invoice.default_payment_method as string | undefined;
      if (!defaultPmId) {
        const rawInvoice: any = invoice as any;
        const subscriptionId = typeof rawInvoice.parent?.subscription_details?.subscription === 'string'
          ? rawInvoice.parent.subscription_details.subscription
          : rawInvoice.parent?.subscription_details?.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          defaultPmId = sub.default_payment_method as string | undefined;
        }
      }

      if (!defaultPmId) {
        await markInvoiceProcessed(invoiceId, 'stripe', { reason: 'missing_default_payment_method' });
        return json({ received: true, type: event.type, skipped: true, reason: 'missing_default_payment_method' });
      }

      let holderReference: string | undefined;
      let paymentInstrumentId: string | undefined;
      try {
        const rawInv: any = invoice as any;
        const subscriptionId = typeof rawInv.parent?.subscription_details?.subscription === 'string'
          ? rawInv.parent.subscription_details.subscription
          : rawInv.parent?.subscription_details?.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          holderReference = (sub.metadata as any)?.holderReference;
        }
        const pm = await stripe.paymentMethods.retrieve(defaultPmId);
        paymentInstrumentId = (pm as any)?.metadata?.payrails_instrument_id;
      } catch {
        // keep fallbacks
      }

      const logger = createLogger({ route: '/stripe/webhook', invoiceId });
      const executionResult = await executePayrailsWorkflow({
        amount: invoice.amount_remaining / 100,
        currency: invoice.currency,
        invoiceId: invoice.id,
        holderReference,
        merchantReference: invoice.id,
        paymentInstrumentId,
      }, logger);

      const { paymentRecordId } = await ensurePaymentRecord({
        stripe,
        stripeSecretKey: runtimeEnv.STRIPE_SECRET_KEY,
        invoice,
        paymentMethodId: defaultPmId,
        customerId: invoice.customer as string,
        amountMinor: invoice.amount_remaining,
        currency: invoice.currency,
        initiatedAt: Math.floor(Date.now() / 1000),
        completedAt: Math.floor(Date.now() / 1000),
        paymentReferenceId: executionResult.referenceId,
        succeeded: executionResult.succeeded,
        offSession: true,
      });

      await serviceClient.from('payment_records').insert({
        engine: 'stripe',
        user_id: null,
        payment_record_id: paymentRecordId,
        invoice_id: invoice.id,
        payment_method_id: defaultPmId,
        customer_id: invoice.customer as string,
        amount_minor: invoice.amount_remaining,
        currency: invoice.currency,
        status: executionResult.succeeded ? 'succeeded' : 'failed',
        payload: {
          source: 'webhook',
          eventId: event.id,
          referenceId: executionResult.referenceId,
        },
      });

      if (executionResult.succeeded) {
        await markInvoiceProcessed(invoiceId, 'stripe', { paymentRecordId, succeeded: true });
      }
    } catch (error) {
      await insertWebhookEvent({
        source: 'stripe',
        eventId: event.id,
        eventType: event.type,
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return serverError('Webhook processing error', error instanceof Error ? error.message : String(error));
    }
  }

  return json({ received: true, type: event.type });
});

app.post('/chargebee/estimate', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  return json({
    itemPriceId: 'basic-montly-GBP-Monthly',
    amountMinor: 2500,
    currency: 'USD',
    estimateReference: `cb_est_${crypto.randomUUID()}`,
  });
});

app.post('/chargebee/subscriptions', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { holderReference, email } = body;
  if (!holderReference) return badRequest('Missing holderReference');
  if (!email) return badRequest('Missing email');
  if (!hasStripeConfigured()) return serverError('Stripe not configured');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return badRequest('Invalid email format');

  const chargebee = getChargebeeClient();
  if (!chargebee) return serverError('Chargebee not configured');

  const stripe = getStripeClient();
  if (!stripe) return serverError('Stripe not configured');

  const ITEM_PRICE_ID = 'deep-groove-USD-Monthly';
  try {
    await stripe.customers.create({
      description: 'John Doe - Payrails Chargebee Customer',
      email,
      metadata: { holderReference },
    });

    const customerResult = await chargebee.customer.create({
      email,
      auto_collection: 'off',
    });
    const customerId = customerResult.customer.id;

    const subscriptionResult = await chargebee.subscription.createWithItems(customerId, {
      subscription_items: [{ item_price_id: ITEM_PRICE_ID, quantity: 1 }],
      meta_data: { holderReference },
    });

    const subscriptionId = subscriptionResult.subscription.id;
    const invoiceId = subscriptionResult.invoice.id;

    const { data: inserted } = await serviceClient
      .from('subscriptions')
      .insert({
        user_id: user.id,
        engine: 'chargebee',
        holder_reference: holderReference,
        customer_id: customerId,
        subscription_id: subscriptionId,
        invoice_id: invoiceId,
        amount: String(2500),
        currency: 'USD',
        email,
        payload: {},
      })
      .select('id')
      .single();

    return json({
      id: inserted?.id,
      userId: user.id,
      customer: { id: customerId, email },
      subscription: { id: subscriptionId },
      invoiceId,
      holderReference,
      amount: String(2500),
      currency: 'USD',
      email,
    });
  } catch (error) {
    return serverError('Unknown Chargebee error', error instanceof Error ? error.message : String(error));
  }
});

async function recordChargebeePayment(input: {
  invoiceId: string;
  amountMinor: number;
  currency: string;
  reference?: string;
  subscriptionId?: string;
  instrumentId?: string;
  userId?: string;
  transactionStatus?: 'success' | 'failure';
  errorCode?: string;
  errorText?: string;
  comment?: string;
}) {
  const chargebee = getChargebeeClient();
  if (!chargebee) {
    throw new Error('Chargebee not configured');
  }

  const txnRef = input.reference || `ext_ref_${crypto.randomUUID().slice(0, 8)}`;
  const transaction: Record<string, unknown> = {
    amount: input.amountMinor,
    payment_method: 'custom',
    custom_payment_method_id: 'Payrails',
    id_at_gateway: input.instrumentId || 'unknown-instrument',
    date: Math.floor(Date.now() / 1000),
  };

  if (input.transactionStatus) {
    transaction.status = input.transactionStatus;
  }
  if (input.errorCode) {
    transaction.error_code = input.errorCode;
  }
  if (input.errorText) {
    transaction.error_text = input.errorText;
  }

  const recordPayload: Record<string, unknown> = { transaction };
  if (input.comment) {
    recordPayload.comment = input.comment;
  }

  const recordResult = await chargebee.invoice.recordPayment(input.invoiceId, recordPayload);

  if (input.subscriptionId && input.transactionStatus !== 'failure') {
    const existing = await chargebee.subscription.retrieve(input.subscriptionId);
    const existingMeta = existing.subscription?.meta_data || {};
    await chargebee.subscription.updateForItems(input.subscriptionId, {
      meta_data: {
        instrumentId: input.instrumentId,
        holderReference: existingMeta.holderReference || 'unknown-holder',
      },
    });
  }

  const invoiceObj = recordResult.invoice;
  const status = input.transactionStatus === 'failure' ? 'failed' : (invoiceObj?.status || 'paid');
  const paymentRecordId = `${invoiceObj?.id || input.invoiceId}_payment`;
  const successAt = Date.now();

  if (input.userId) {
    await serviceClient.from('payment_records').insert({
      user_id: input.userId,
      engine: 'chargebee',
      payment_record_id: paymentRecordId,
      invoice_id: input.invoiceId,
      subscription_id: input.subscriptionId || null,
      amount_minor: input.amountMinor,
      currency: input.currency,
      status,
      payload: {
        reference: txnRef,
        instrumentId: input.instrumentId,
        successAt,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.errorText ? { errorText: input.errorText } : {}),
      },
    });
  }

  return {
    paymentRecordId,
    invoiceId: input.invoiceId,
    amount: input.amountMinor,
    currency: input.currency,
    reference: txnRef,
    status,
    successAt,
    subscriptionId: input.subscriptionId,
    instrumentId: input.instrumentId,
  };
}

app.post('/chargebee/record-payment', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { invoiceId, amountMinor = 2500, currency = 'USD', reference, subscriptionId, instrumentId } = body;
  if (!invoiceId) return badRequest('Missing invoiceId');

  try {
    const result = await recordChargebeePayment({
      invoiceId,
      amountMinor,
      currency,
      reference,
      subscriptionId,
      instrumentId,
      userId: user.id,
    });
    return json({ id: crypto.randomUUID(), userId: user.id, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Chargebee not configured') {
      return serverError('Chargebee not configured');
    }
    return serverError('Unknown Chargebee error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/chargebee/webhook', async (c) => {
  const rawBody = await c.req.text();
  let payload: any = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  const eventType = payload.event_type || payload.type || 'unknown';
  const invoiceId = payload?.content?.invoice?.id;

  const payloadPath = await persistWebhookPayload('chargebee', invoiceId || crypto.randomUUID(), rawBody);
  await insertWebhookEvent({
    source: 'chargebee',
    eventId: invoiceId,
    eventType,
    payloadPath,
    status: 'received',
  });

  if (eventType !== 'invoice_generated') {
    return json({ received: true, ignored: true });
  }

  if (!invoiceId) return badRequest('Missing invoice id');
  if (!hasChargebeeConfigured()) return serverError('Chargebee not configured');

  const status = payload?.content?.invoice?.status;
  const amountDueMinor = payload?.content?.invoice?.amount_due;
  const currency = payload?.content?.invoice?.currency_code;
  const subscriptionId = payload?.content?.invoice?.subscription_id;
  const customerId = payload?.content?.invoice?.customer_id;

  const chargebee = getChargebeeClient();
  if (!chargebee) return serverError('Chargebee not configured');

  let holderReference: string | undefined;
  let instrumentId: string | undefined;
  if (subscriptionId) {
    try {
      const sub = await chargebee.subscription.retrieve(subscriptionId);
      holderReference = sub.subscription?.meta_data?.holderReference;
      instrumentId = sub.subscription?.meta_data?.instrumentId;
    } catch {
      // non-fatal
    }
  }

  let processedOffSession = false;
  let paymentRecord: any = null;
  let executionId: string | undefined;

  if (
    amountDueMinor &&
    amountDueMinor > 0 &&
    ['pending', 'payment_due', 'not_paid', 'unpaid'].includes(String(status || '').toLowerCase())
  ) {
    if (await isInvoiceProcessed(invoiceId)) {
      return json({ invoiceId, processed: true, duplicate: true });
    }

    try {
      const logger = createLogger({ route: '/chargebee/webhook', invoiceId });
      const executionResult = await executePayrailsWorkflow({
        amount: amountDueMinor / 100,
        currency: currency || 'USD',
        invoiceId,
        holderReference,
        merchantReference: invoiceId,
        paymentInstrumentId: instrumentId,
      }, logger);

      executionId = executionResult.referenceId;

      if (executionResult.succeeded) {
        paymentRecord = await recordChargebeePayment({
          invoiceId,
          amountMinor: amountDueMinor,
          currency: currency || 'USD',
          subscriptionId,
          instrumentId,
        });
        processedOffSession = true;
        await markInvoiceProcessed(invoiceId, 'chargebee', {
          executionId,
          paymentRecordId: paymentRecord?.paymentRecordId,
        });
      } else {
        // Record a failed payment against the Chargebee invoice so it's visible in billing
        const failureCode = executionResult.referenceId || 'payrails_execution_failed';
        const failureText = `Payrails payment execution failed. Execution ID: ${executionId || 'unknown'}`;
        paymentRecord = await recordChargebeePayment({
          invoiceId,
          amountMinor: amountDueMinor,
          currency: currency || 'USD',
          subscriptionId,
          instrumentId,
          transactionStatus: 'failure',
          errorCode: failureCode,
          errorText: failureText,
          comment: `Automated payment attempt failed via Payrails (execution: ${executionId || 'unknown'})`,
        });
      }
    } catch (error) {
      await insertWebhookEvent({
        source: 'chargebee',
        eventId: invoiceId,
        eventType,
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return serverError('Chargebee webhook processing error', error instanceof Error ? error.message : String(error));
    }
  }

  return json({
    invoiceId,
    subscriptionId,
    customerId,
    status,
    amountDueMinor,
    currency,
    instrumentId,
    executionId,
    processed: true,
    processedOffSession,
    paymentRecord,
  });
});

// ─── Recurly routes ───────────────────────────────────────────────────────────

import {
  createAccount as recurlyCreateAccount,
  createSubscription as recurlyCreateSubscription,
  recordExternalTransaction as recurlyRecordExternalTransaction,
  getSubscription as recurlyGetSubscription,
  getAccount as recurlyGetAccount,
} from '../_shared/recurly.ts';

app.post('/recurly/subscriptions', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  if (!hasRecurlyConfigured()) return serverError('Recurly not configured');

  let body: any = {};
  try { body = await c.req.json(); } catch { body = {}; }

  const { holderReference, email } = body;
  if (!holderReference) return badRequest('Missing holderReference');
  if (!email) return badRequest('Missing email');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return badRequest('Invalid email format');

  const accountCode = `rc_${crypto.randomUUID()}`;
  const PLAN_CODE = 'standard';
  const CURRENCY = 'GBP';

  try {
    const account = await recurlyCreateAccount({ code: accountCode, email, holderReference });

    const subscription = await recurlyCreateSubscription({
      accountCode,
      planCode: PLAN_CODE,
      currency: CURRENCY,
    });

    let invoiceNumber: string | undefined;
    if (subscription.pending_setup_invoice?.id) {
      invoiceNumber = subscription.pending_setup_invoice.id;
    }
    if (!invoiceNumber && subscription.active_invoice_id) {
      invoiceNumber = subscription.active_invoice_id;
    }

    const subscriptionId = subscription.id || subscription.uuid;

    const { data: inserted } = await serviceClient
      .from('subscriptions')
      .insert({
        user_id: user.id,
        engine: 'recurly',
        holder_reference: holderReference,
        customer_id: accountCode,
        subscription_id: subscriptionId,
        invoice_id: invoiceNumber || null,
        amount: String(1199),
        currency: CURRENCY,
        email,
        payload: { accountId: account.id },
      })
      .select('id')
      .single();

    return json({
      id: inserted?.id,
      userId: user.id,
      customer: { id: accountCode, email },
      subscription: { id: subscriptionId },
      invoiceId: invoiceNumber,
      holderReference,
      amount: String(1199),
      currency: CURRENCY,
      email,
    });
  } catch (error) {
    return serverError('Recurly subscription error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/recurly/record-payment', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized();

  if (!hasRecurlyConfigured()) return serverError('Recurly not configured');

  let body: any = {};
  try { body = await c.req.json(); } catch { body = {}; }

  const { invoiceId, amountMinor = 1199, currency = 'GBP', subscriptionId, instrumentId } = body;
  if (!invoiceId) return badRequest('Missing invoiceId');

  try {
    const txnResult = await recurlyRecordExternalTransaction({
      invoiceNumber: invoiceId,
      amountMinor,
      currency,
      succeeded: true,
      description: `Payrails payment (instrument: ${instrumentId || 'unknown'})`,
    });

    const paymentRecordId = txnResult?.id || `${invoiceId}_payment`;
    const successAt = Date.now();

    await serviceClient.from('payment_records').insert({
      user_id: user.id,
      engine: 'recurly',
      payment_record_id: paymentRecordId,
      invoice_id: invoiceId,
      subscription_id: subscriptionId || null,
      amount_minor: amountMinor,
      currency,
      status: 'succeeded',
      payload: {
        instrumentId,
        successAt,
        transactionId: txnResult?.id,
      },
    });

    return json({
      id: crypto.randomUUID(),
      userId: user.id,
      paymentRecordId,
      invoiceId,
      amount: amountMinor,
      currency,
      status: 'succeeded',
      successAt,
      subscriptionId,
      instrumentId,
    });
  } catch (error) {
    return serverError('Recurly record-payment error', error instanceof Error ? error.message : String(error));
  }
});

app.post('/recurly/webhook', async (c) => {
  const rawBody = await c.req.text();
  let payload: any = {};
  try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = {}; }

  const eventType = payload.event_type || payload.type || 'unknown';
  const invoiceId = payload?.invoice?.id || payload?.content?.invoice?.id;

  const payloadPath = await persistWebhookPayload('recurly', invoiceId || crypto.randomUUID(), rawBody);
  await insertWebhookEvent({
    source: 'recurly',
    eventId: invoiceId,
    eventType,
    payloadPath,
    status: 'received',
  });

  if (eventType !== 'charge_invoice.created') {
    return json({ received: true, ignored: true });
  }

  if (!invoiceId) return badRequest('Missing invoice id');
  if (!hasRecurlyConfigured()) return serverError('Recurly not configured');

  const amountDueMinor = Math.round((payload?.invoice?.total || 0) * 100);
  const currency = payload?.invoice?.currency || 'GBP';
  const subscriptionId = payload?.invoice?.subscription_ids?.[0];

  let holderReference: string | undefined;
  let instrumentId: string | undefined;
  if (subscriptionId) {
    try {
      const sub = await recurlyGetSubscription(subscriptionId);
      if (sub.account?.code) {
        const acct = await recurlyGetAccount(sub.account.code);
        holderReference = acct?.username || undefined;
      }
    } catch { /* non-fatal */ }

    if (!holderReference) {
      const { data: subRow } = await serviceClient
        .from('subscriptions')
        .select('holder_reference')
        .eq('engine', 'recurly')
        .eq('subscription_id', subscriptionId)
        .maybeSingle();
      holderReference = subRow?.holder_reference || undefined;
    }
  }

  if (await isInvoiceProcessed(invoiceId)) {
    return json({ invoiceId, processed: true, duplicate: true });
  }

  let processedOffSession = false;
  let paymentRecord: any = null;
  let executionRefId: string | undefined;

  if (amountDueMinor > 0) {
    try {
      const logger = createLogger({ route: '/recurly/webhook', invoiceId });
      const executionResult = await executePayrailsWorkflow({
        amount: amountDueMinor / 100,
        currency,
        invoiceId,
        holderReference,
        merchantReference: invoiceId,
        paymentInstrumentId: instrumentId,
      }, logger);

      executionRefId = executionResult.referenceId;

      await recurlyRecordExternalTransaction({
        invoiceNumber: invoiceId,
        amountMinor: amountDueMinor,
        currency,
        succeeded: executionResult.succeeded,
        description: `Payrails webhook payment (ref: ${executionRefId})`,
      });

      if (executionResult.succeeded) {
        await serviceClient.from('payment_records').insert({
          engine: 'recurly',
          user_id: null,
          payment_record_id: `${invoiceId}_webhook_payment`,
          invoice_id: invoiceId,
          subscription_id: subscriptionId || null,
          amount_minor: amountDueMinor,
          currency,
          status: 'succeeded',
          payload: { source: 'webhook', executionId: executionRefId },
        });
        processedOffSession = true;
        await markInvoiceProcessed(invoiceId, 'recurly', { executionId: executionRefId });
      } else {
        await serviceClient.from('payment_records').insert({
          engine: 'recurly',
          user_id: null,
          payment_record_id: `${invoiceId}_webhook_payment_failed`,
          invoice_id: invoiceId,
          subscription_id: subscriptionId || null,
          amount_minor: amountDueMinor,
          currency,
          status: 'failed',
          payload: { source: 'webhook', executionId: executionRefId },
        });
      }
    } catch (error) {
      await insertWebhookEvent({
        source: 'recurly',
        eventId: invoiceId,
        eventType,
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return serverError('Recurly webhook processing error', error instanceof Error ? error.message : String(error));
    }
  }

  return json({
    invoiceId,
    subscriptionId,
    currency,
    amountDueMinor,
    executionId: executionRefId,
    processed: true,
    processedOffSession,
  });
});

app.notFound(() => json({ error: 'Not found' }, 404));

Deno.serve((req) => app.fetch(req));
