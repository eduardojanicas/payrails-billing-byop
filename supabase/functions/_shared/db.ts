import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { runtimeEnv } from './env.ts';

export const serviceClient = createClient(
  runtimeEnv.SUPABASE_URL,
  runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

export async function insertWebhookEvent(payload: {
  source: 'stripe' | 'chargebee';
  eventId?: string;
  eventType?: string;
  payloadPath?: string;
  status?: string;
  details?: Record<string, unknown>;
}) {
  await serviceClient.from('webhook_events').insert({
    source: payload.source,
    event_id: payload.eventId || null,
    event_type: payload.eventType || null,
    payload_path: payload.payloadPath || null,
    status: payload.status || 'received',
    details: payload.details || {},
  });
}

export async function persistWebhookPayload(source: 'stripe' | 'chargebee', eventId: string, raw: string): Promise<string | undefined> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${source}/${stamp}-${eventId || crypto.randomUUID()}.json`;
  const blob = new Blob([raw], { type: 'application/json' });
  const { error } = await serviceClient.storage.from('webhook-events').upload(path, blob, {
    contentType: 'application/json',
    upsert: false,
  });
  if (error) return undefined;
  return path;
}

export async function isInvoiceProcessed(invoiceId: string): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('processed_invoices')
    .select('invoice_id')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (error) return false;
  return !!data?.invoice_id;
}

export async function markInvoiceProcessed(invoiceId: string, source: 'stripe' | 'chargebee', metadata: Record<string, unknown> = {}) {
  await serviceClient.from('processed_invoices').upsert({
    invoice_id: invoiceId,
    source,
    metadata,
  }, { onConflict: 'invoice_id' });
}
