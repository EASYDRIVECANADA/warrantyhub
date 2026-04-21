-- Migration: 20260417120000_brochure_anon_access.sql
-- Purpose: Allow anonymous (logged-out) visitors to read published products
--          and approved providers so the public /brochure page works without login.
--
-- The existing policy was: to authenticated only.
-- Changed to: to anon, authenticated (covers both logged-out and logged-in users).

drop policy if exists "products_select_published_any" on public.products;
create policy "products_select_published_any"
  on public.products for select
  to anon, authenticated
  using (published = true);
