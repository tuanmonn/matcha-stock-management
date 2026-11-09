create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  grams int not null check (grams > 0),
  packaging text not null check (packaging in ('can','bag')),
  details text not null default '',
  store_price int not null check (store_price >= 0),
  etsy_listing_id text,
  low_stock_at int not null default 3,
  active boolean not null default true
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  received_on date not null,
  freight_amount bigint not null check (freight_amount >= 0),
  freight_currency text not null check (freight_currency in ('USD','VND')),
  note text not null default ''
);

create table if not exists shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments on delete cascade,
  product_id uuid not null references products,
  units int not null check (units > 0),
  vendor_amount bigint not null check (vendor_amount >= 0),
  vendor_currency text not null check (vendor_currency in ('USD','VND')),
  expiry_date date not null
);

create table if not exists sales (
  id uuid primary key,
  channel text not null check (channel in ('etsy','store')),
  sold_at timestamptz not null,
  product_id uuid not null references products,
  qty int not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),
  currency text not null check (currency in ('USD','VND')),
  etsy_receipt_id text,
  etsy_transaction_id text unique
);

create table if not exists stock_moves (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products,
  qty_delta int not null check (qty_delta <> 0),
  kind text not null check (kind in ('shipment','sale','correction')),
  ref text not null,
  reason text not null default '',
  at timestamptz not null,
  unique (kind, ref)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  category text not null check (category in ('packaging','gift')),
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('USD','VND')),
  note text not null default ''
);

create table if not exists monthly_history (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  product_id uuid not null references products,
  channel text not null check (channel in ('etsy','store')),
  units int not null check (units >= 0),
  revenue bigint not null check (revenue >= 0),
  currency text not null check (currency in ('USD','VND')),
  orders int not null check (orders >= 0),
  unique (month, product_id, channel)
);

create table if not exists expiry_dates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products,
  expiry_date date not null,
  cleared_at timestamptz,
  unique (product_id, expiry_date)
);

alter table expiry_dates add column if not exists cleared_by text check (cleared_by in ('auto','user'));

create table if not exists fx_rates (
  year int primary key,
  vnd_per_usd numeric not null check (vnd_per_usd > 0)
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  time_zone text
);

insert into settings (id) values (1) on conflict do nothing;

create table if not exists etsy_ledger (
  entry_id text primary key,
  at timestamptz not null,
  ledger_type text not null,
  reference_type text,
  reference_id text,
  amount bigint not null,
  currency text not null check (currency in ('USD','VND')),
  category text not null check (category in ('fee','ads','ignore','uncategorized')),
  product_id uuid references products,
  raw jsonb
);

create table if not exists sync_issues (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mismatch','unknown_listing','etsy_error')),
  ref text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (kind, ref)
);

create table if not exists webhook_events (
  webhook_id text primary key,
  received_at timestamptz not null default now()
);

alter table sales add column if not exists discount bigint not null default 0 check (discount >= 0);

alter table settings add column if not exists etsy_shop_id text;
alter table settings add column if not exists etsy_user_id text;
alter table settings add column if not exists etsy_access_token text;
alter table settings add column if not exists etsy_refresh_token text;
alter table settings add column if not exists etsy_expires_at timestamptz;
alter table settings add column if not exists etsy_connected_at timestamptz;
alter table settings add column if not exists etsy_status text check (etsy_status in ('connected','reconnect'));
alter table settings add column if not exists etsy_oauth_state text;
alter table settings add column if not exists etsy_code_verifier text;
alter table settings add column if not exists etsy_oauth_started_at timestamptz;
