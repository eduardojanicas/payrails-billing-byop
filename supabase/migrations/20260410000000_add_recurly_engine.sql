-- Add 'recurly' to all engine/source CHECK constraints

-- profiles.billing_engine
alter table public.profiles drop constraint if exists profiles_billing_engine_check;
alter table public.profiles add constraint profiles_billing_engine_check
  check (billing_engine in ('stripe', 'chargebee', 'recurly'));

-- subscriptions.engine
alter table public.subscriptions drop constraint if exists subscriptions_engine_check;
alter table public.subscriptions add constraint subscriptions_engine_check
  check (engine in ('stripe', 'chargebee', 'recurly'));

-- payment_records.engine
alter table public.payment_records drop constraint if exists payment_records_engine_check;
alter table public.payment_records add constraint payment_records_engine_check
  check (engine in ('stripe', 'chargebee', 'recurly'));

-- processed_invoices.source
alter table public.processed_invoices drop constraint if exists processed_invoices_source_check;
alter table public.processed_invoices add constraint processed_invoices_source_check
  check (source in ('stripe', 'chargebee', 'recurly'));

-- webhook_events.source
alter table public.webhook_events drop constraint if exists webhook_events_source_check;
alter table public.webhook_events add constraint webhook_events_source_check
  check (source in ('stripe', 'chargebee', 'recurly'));
