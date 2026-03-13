create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  holder_reference text,
  billing_engine text not null default 'stripe' check (billing_engine in ('stripe', 'chargebee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  engine text not null check (engine in ('stripe', 'chargebee')),
  holder_reference text not null,
  customer_id text,
  subscription_id text,
  invoice_id text,
  amount text,
  currency text,
  email text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  engine text not null check (engine in ('stripe', 'chargebee')),
  payment_record_id text,
  invoice_id text,
  payment_method_id text,
  customer_id text,
  subscription_id text,
  amount_minor bigint,
  currency text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.processed_invoices (
  invoice_id text primary key,
  source text not null check (source in ('stripe', 'chargebee')),
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe', 'chargebee')),
  event_id text,
  event_type text,
  payload_path text,
  status text not null default 'received',
  details jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_payment_records_user_id on public.payment_records(user_id);
create index if not exists idx_payment_records_invoice_id on public.payment_records(invoice_id);
create index if not exists idx_webhook_events_source_event on public.webhook_events(source, event_id);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_records enable row level security;
alter table public.processed_invoices enable row level security;
alter table public.webhook_events enable row level security;

do $$ begin
  create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles_update_own" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "subscriptions_insert_own" on public.subscriptions for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "payment_records_select_own" on public.payment_records for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "payment_records_insert_own" on public.payment_records for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "processed_invoices_service_role" on public.processed_invoices for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "webhook_events_service_role" on public.webhook_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public)
values ('webhook-events', 'webhook-events', false)
on conflict (id) do nothing;

do $$ begin
  create policy "webhook_events_bucket_service_role_read"
    on storage.objects
    for select
    using (bucket_id = 'webhook-events' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "webhook_events_bucket_service_role_write"
    on storage.objects
    for insert
    with check (bucket_id = 'webhook-events' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "webhook_events_bucket_service_role_update"
    on storage.objects
    for update
    using (bucket_id = 'webhook-events' and auth.role() = 'service_role')
    with check (bucket_id = 'webhook-events' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "webhook_events_bucket_service_role_delete"
    on storage.objects
    for delete
    using (bucket_id = 'webhook-events' and auth.role() = 'service_role');
exception when duplicate_object then null; end $$;
