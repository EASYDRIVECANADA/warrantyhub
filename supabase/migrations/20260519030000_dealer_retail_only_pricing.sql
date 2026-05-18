create or replace function public.prevent_dealer_cost_write_from_dealer_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.has_role(auth.uid(), 'super_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.dealer_cost, '{}'::jsonb) <> '{}'::jsonb then
    raise exception 'Only providers or platform admins can change dealer cost';
  end if;

  if tg_op = 'UPDATE' and new.dealer_cost is distinct from old.dealer_cost then
    raise exception 'Only providers or platform admins can change dealer cost';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dealership_product_pricing_prevent_dealer_cost_write
  on public.dealership_product_pricing;
create trigger trg_dealership_product_pricing_prevent_dealer_cost_write
  before insert or update on public.dealership_product_pricing
  for each row execute function public.prevent_dealer_cost_write_from_dealer_admin();
