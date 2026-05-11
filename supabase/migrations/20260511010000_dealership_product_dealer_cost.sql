alter table public.dealership_product_pricing
  add column if not exists dealer_cost jsonb not null default '{}';
