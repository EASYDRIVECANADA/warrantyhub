-- Company access tooling now owns tenant/company/member creation through
-- service-role Edge Functions. Browser clients should not be able to create
-- company or membership rows directly.

drop policy if exists "Authenticated can insert dealerships" on public.dealerships;
drop policy if exists "Authenticated can insert dealership members" on public.dealership_members;
drop policy if exists "Authenticated can insert providers" on public.providers;
drop policy if exists "Authenticated can insert provider members" on public.provider_members;
