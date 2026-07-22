-- RAFD P1 schema extensions
-- Run after p0_security.sql

create table if not exists cashier_shifts (
  id serial primary key,
  tenant_id integer not null,
  branch_id integer,
  user_id integer,
  user_name text,
  opening_float numeric default 0,
  closing_counted numeric,
  expected_cash numeric,
  variance numeric,
  sales_count integer default 0,
  sales_total numeric default 0,
  cash_total numeric default 0,
  card_total numeric default 0,
  transfer_total numeric default 0,
  credit_total numeric default 0,
  status text default 'open',
  opened_at timestamptz default now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

create table if not exists refunds (
  id serial primary key,
  tenant_id integer not null,
  sale_id integer not null,
  invoice_number text,
  mode text default 'refund',
  amount numeric default 0,
  refund_method text default 'cash',
  reason text,
  status text default 'completed',
  created_by text,
  user_id integer,
  created_at timestamptz default now()
);

create table if not exists refund_items (
  id serial primary key,
  refund_id integer not null,
  sale_item_id integer,
  product_id integer,
  product_name text,
  quantity numeric default 0,
  unit_price numeric default 0,
  total numeric default 0,
  weight_g numeric
);

create table if not exists stocktake_sessions (
  id serial primary key,
  tenant_id integer not null,
  branch_id integer,
  title text,
  status text default 'draft',
  notes text,
  created_by text,
  user_id integer,
  posted_by text,
  posted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists stocktake_lines (
  id serial primary key,
  session_id integer not null,
  product_id integer,
  product_name text,
  sku text,
  barcode text,
  system_qty numeric default 0,
  counted_qty numeric,
  variance numeric
);

create table if not exists user_invites (
  id serial primary key,
  tenant_id integer not null,
  email text not null,
  full_name text,
  role text default 'cashier',
  phone text,
  token text unique,
  status text default 'pending',
  invited_by integer,
  invited_by_name text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists push_subscriptions (
  id serial primary key,
  tenant_id integer not null,
  user_id integer,
  endpoint text not null,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists whatsapp_outbox (
  id serial primary key,
  tenant_id integer not null,
  user_id integer,
  phone text,
  message text,
  channel text,
  status text,
  reference text,
  meta jsonb,
  created_at timestamptz default now()
);

-- ensure audit_logs exists with flexible columns
create table if not exists audit_logs (
  id serial primary key,
  tenant_id integer,
  user_id integer,
  action text,
  entity_type text,
  entity_id text,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_shifts_tenant on cashier_shifts(tenant_id);
create index if not exists idx_refunds_tenant on refunds(tenant_id);
create index if not exists idx_stocktake_tenant on stocktake_sessions(tenant_id);
create index if not exists idx_invites_token on user_invites(token);
create index if not exists idx_audit_tenant on audit_logs(tenant_id);
