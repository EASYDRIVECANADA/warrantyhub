-- Migration: 20260418000000_fix_provider_product_rls.sql
-- Problem: products_select_published_any was changed to "to anon, authenticated"
--          which lets providers see ALL published products (not just their own)
--          because RLS policies are OR'd.
--
-- Fix:
--   1. Revert products_select_published_any to "to anon" only (brochure public access)
--   2. Create products_select_published_dealer for authenticated dealers/non-providers
--      using NOT is_any_provider_member() so providers are excluded from this policy

-- Helper: returns true if the user is a member of any provider
create or replace function public.is_any_provider_member(_user_id uuid)
returns boolean as $$
  select exists(
    select 1 from public.provider_members
    where user_id = _user_id
  );
$$ language sql security definer stable;

-- Revert to anon-only for brochure access
drop policy if exists "products_select_published_any" on public.products;
create policy "products_select_published_any"
  on public.products for select
  to anon
  using (published = true);

-- Dealers (authenticated, non-provider) can see all published products
drop policy if exists "products_select_published_dealer" on public.products;
create policy "products_select_published_dealer"
  on public.products for select
  to authenticated
  using (published = true and not public.is_any_provider_member(auth.uid()));
