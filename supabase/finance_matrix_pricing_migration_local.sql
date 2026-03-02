-- Local-only migration for FINANCE_MATRIX (GAP) pricing support

create extension if not exists btree_gist;

alter table public.products
  add column if not exists pricing_structure text;

do $$
begin
  alter table public.products
    drop constraint if exists products_pricing_structure_check;

  alter table public.products
    add constraint products_pricing_structure_check
    check (pricing_structure is null or pricing_structure in ('FLAT','MILEAGE','CLASS','MILEAGE_CLASS','FINANCE_MATRIX'));
exception
  when duplicate_object then null;
end $$;

alter table public.product_pricing
  add column if not exists loan_amount_min_cents integer;

alter table public.product_pricing
  add column if not exists loan_amount_max_cents integer;

alter table public.product_pricing
  add column if not exists finance_term_months integer;

alter table public.product_pricing
  add column if not exists provider_net_cost_cents integer;

alter table public.product_pricing
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_loan_min_check
    check (loan_amount_min_cents is null or loan_amount_min_cents >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_loan_max_check
    check (loan_amount_max_cents is null or loan_amount_max_cents >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_loan_band_check
    check (
      loan_amount_min_cents is null
      or loan_amount_max_cents is null
      or loan_amount_max_cents > loan_amount_min_cents
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_term_months_check
    check (
      finance_term_months is null
      or finance_term_months in (24,36,48,60,72,84,96)
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_provider_net_cost_check
    check (provider_net_cost_cents is null or provider_net_cost_cents > 0);
exception
  when duplicate_object then null;
end $$;

-- If finance_term_months is set, require matrix fields.
do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_matrix_required_fields_check
    check (
      finance_term_months is null
      or (
        loan_amount_min_cents is not null
        and loan_amount_max_cents is not null
        and provider_net_cost_cents is not null
      )
    );
exception
  when duplicate_object then null;
end $$;

-- Prevent overlapping loan bands for the same product + finance term.
-- If you intentionally want overlaps, remove this constraint.
do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_finance_matrix_no_overlap
    exclude using gist (
      product_id with =,
      finance_term_months with =,
      int4range(loan_amount_min_cents, loan_amount_max_cents, '[]') with &&
    )
    where (finance_term_months is not null);
exception
  when duplicate_object then null;
end $$;

create index if not exists product_pricing_finance_matrix_lookup
  on public.product_pricing (product_id, finance_term_months, loan_amount_min_cents, loan_amount_max_cents)
  where finance_term_months is not null;
