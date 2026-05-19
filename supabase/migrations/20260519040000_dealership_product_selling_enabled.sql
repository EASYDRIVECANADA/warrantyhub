alter table public.dealership_product_pricing
  add column if not exists selling_enabled boolean not null default false;

create index if not exists idx_dealership_product_pricing_selling_enabled
  on public.dealership_product_pricing(dealership_id, selling_enabled, product_id);
