create extension if not exists pgcrypto;

-- =========================
-- Phase 1: Shared Supabase Schema (Draft)
-- Single source of truth for auth roles + core entities.
-- Note: This is a draft intended for incremental rollout.
-- =========================

-- ---------
-- profiles
-- ---------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN','SUPER_ADMIN','DEALER','DEALER_ADMIN','PROVIDER')),
  email text,
  display_name text,
  company_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text;

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists company_name text;

alter table public.profiles
  add column if not exists email text;

-- -------
-- dealers
-- -------
create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- -------------
-- dealer_members
-- -------------
create table if not exists public.dealer_members (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('DEALER','DEALER_ADMIN')),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  unique (dealer_id, user_id)
);

-- ---------------
-- access_requests
-- ---------------
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('DEALER','PROVIDER')),
  company text not null,
  name text not null,
  email text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- --------
-- products
-- --------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  product_type text not null
    check (product_type in ('EXTENDED_WARRANTY','GAP','TIRE_RIM','APPEARANCE','OTHER')),
  coverage_details text,
  exclusions text,
  term_months integer,
  term_km integer,
  deductible_cents integer,
  eligibility_max_vehicle_age_years integer,
  eligibility_max_mileage_km integer,
  eligibility_make_allowlist text[],
  eligibility_model_allowlist text[],
  eligibility_trim_allowlist text[],
  base_price_cents integer,
  dealer_cost_cents integer,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists dealer_cost_cents integer;

create table if not exists public.product_pricing (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  term_months integer not null,
  term_km integer not null,
  deductible_cents integer not null,
  base_price_cents integer not null,
  dealer_cost_cents integer,
  created_at timestamptz not null default now(),
  unique (product_id, term_months, term_km, deductible_cents)
);

-- ---------
-- contracts
-- ---------
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null,
  customer_name text not null,
  created_at timestamptz not null default now()
);

alter table public.contracts
  add column if not exists warranty_id text;

alter table public.contracts
  add column if not exists status text not null default 'DRAFT'
  check (status in ('DRAFT','SOLD','REMITTED','PAID'));

alter table public.contracts
  add column if not exists updated_at timestamptz not null default now();

alter table public.contracts
  add column if not exists customer_email text;

alter table public.contracts
  add column if not exists customer_phone text;

alter table public.contracts
  add column if not exists customer_address text;

alter table public.contracts
  add column if not exists customer_city text;

alter table public.contracts
  add column if not exists customer_province text;

alter table public.contracts
  add column if not exists customer_postal_code text;

alter table public.contracts
  add column if not exists vin text;

alter table public.contracts
  add column if not exists vehicle_year text;

alter table public.contracts
  add column if not exists vehicle_make text;

alter table public.contracts
  add column if not exists vehicle_model text;

alter table public.contracts
  add column if not exists vehicle_trim text;

alter table public.contracts
  add column if not exists vehicle_body_class text;

alter table public.contracts
  add column if not exists vehicle_engine text;

alter table public.contracts
  add column if not exists vehicle_transmission text;

alter table public.contracts
  add column if not exists vehicle_mileage_km integer;

alter table public.contracts
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.contracts
  add column if not exists provider_id uuid references public.profiles(id) on delete set null;

alter table public.contracts
  add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.contracts
  add column if not exists created_by_user_id text;

alter table public.contracts
  add column if not exists created_by_email text;

alter table public.contracts
  add column if not exists sold_by_user_id text;

alter table public.contracts
  add column if not exists sold_by_email text;

alter table public.contracts
  add column if not exists sold_at timestamptz;

alter table public.contracts
  add column if not exists remitted_by_user_id text;

alter table public.contracts
  add column if not exists remitted_by_email text;

alter table public.contracts
  add column if not exists remitted_at timestamptz;

alter table public.contracts
  add column if not exists paid_by_user_id text;

alter table public.contracts
  add column if not exists paid_by_email text;

alter table public.contracts
  add column if not exists paid_at timestamptz;

-- --------
-- batches
-- --------
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  status text not null check (status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now()
);

alter table public.batches
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.batches
  add column if not exists payment_status text not null default 'UNPAID'
  check (payment_status in ('UNPAID','PAID'));

alter table public.batches
  add column if not exists contract_ids uuid[] not null default '{}';

alter table public.batches
  add column if not exists subtotal_cents integer not null default 0;

alter table public.batches
  add column if not exists tax_rate double precision not null default 0;

alter table public.batches
  add column if not exists tax_cents integer not null default 0;

alter table public.batches
  add column if not exists total_cents integer not null default 0;

alter table public.batches
  add column if not exists paid_at timestamptz;

-- ----------
-- remittances
-- ----------
create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  remittance_number text not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

alter table public.remittances
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.remittances
  add column if not exists status text not null default 'DUE'
  check (status in ('DUE','PAID'));

alter table public.remittances
  add column if not exists updated_at timestamptz not null default now();

-- ---------
-- employees
-- ---------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.employees
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

-- -----------------
-- product_documents
-- -----------------
create table if not exists public.product_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- ---------------------
-- provider_team_members
-- ---------------------
create table if not exists public.provider_team_members (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN','PRODUCT_MANAGER','SUPPORT')),
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','DISABLED')),
  created_at timestamptz not null default now()
);

-- --------------
-- storage bucket
-- --------------
insert into storage.buckets (id, name, public)
values ('product-documents', 'product-documents', false)
on conflict (id) do nothing;
