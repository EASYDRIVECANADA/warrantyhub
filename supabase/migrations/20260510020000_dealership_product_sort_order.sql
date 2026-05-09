alter table public.dealership_product_pricing
  add column if not exists sort_order integer;

create index if not exists idx_dealership_product_pricing_sort_order
  on public.dealership_product_pricing(dealership_id, sort_order, product_id);
