-- Option 1 migration:
-- Allow the same add-on name for different pricing scopes (termMonths + termKm combos),
-- but prevent duplicates within the same scope.

-- Ensure the new column exists in case older environments haven't applied it yet.
alter table public.product_addons
  add column if not exists applicable_term_months integer[];

-- Drop the old uniqueness rule (it blocked duplicate names across scopes)
alter table public.product_addons
  drop constraint if exists product_addons_product_id_name_key;

-- Fallback if the constraint was created with a different name
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.product_addons'::regclass
      and contype = 'u'
  loop
    if c.conname ilike '%product_addons%' and c.conname ilike '%product%' and c.conname ilike '%name%' then
      execute format('alter table public.product_addons drop constraint %I', c.conname);
    end if;
  end loop;
end $$;

-- Helper to normalize UUID arrays to a stable text representation
create or replace function public._sorted_uuid_array_text(arr uuid[])
returns text
language sql
immutable
as $$
  select case
    when arr is null then null
    else array_to_string(array(select x from unnest(arr) x order by x), ',')
  end
$$;

-- Helper to normalize integer arrays (legacy applicable_term_months)
create or replace function public._sorted_int_array_text(arr integer[])
returns text
language sql
immutable
as $$
  select case
    when arr is null then null
    else array_to_string(array(select x from unnest(arr) x order by x), ',')
  end
$$;

-- Enforce uniqueness per product + name + scope
-- Scope definition:
-- - ALL: applies_to_all_pricing_rows = true
-- - SCOPED: applies_to_all_pricing_rows = false and applicable_pricing_row_ids normalized
-- - LEGACY: applies_to_all_pricing_rows = false and applicable_term_months normalized (fallback)
drop index if exists public.product_addons_unique_scope;
create unique index product_addons_unique_scope
  on public.product_addons (
    product_id,
    (lower(name)),
    (
    case
      when applies_to_all_pricing_rows then 'ALL'
      when applicable_pricing_row_ids is not null and cardinality(applicable_pricing_row_ids) > 0 then 'SCOPE:' || public._sorted_uuid_array_text(applicable_pricing_row_ids)
      when applicable_term_months is not null and cardinality(applicable_term_months) > 0 then 'TERM:' || public._sorted_int_array_text(applicable_term_months)
      else 'UNSCOPED'
    end
    )
  );
