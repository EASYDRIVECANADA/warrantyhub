-- =========================
-- Phase 1: RLS policies (Draft)
-- Intended to replace the current permissive "all_authenticated" policies.
-- Apply AFTER phase1_schema.sql.
-- =========================

-- Helpers
create or replace function public.current_role()
returns text
language sql
stable
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.current_dealer_id()
returns uuid
language sql
stable
as $$
  select dm.dealer_id
  from public.dealer_members dm
  where dm.user_id = auth.uid()
    and dm.status = 'ACTIVE'
  limit 1;
$$;

-- -----------------
-- Enable RLS
-- -----------------
alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.products enable row level security;
alter table public.contracts enable row level security;
alter table public.remittances enable row level security;
alter table public.batches enable row level security;
alter table public.employees enable row level security;
alter table public.product_documents enable row level security;
alter table public.provider_team_members enable row level security;

alter table public.product_pricing enable row level security;

alter table public.dealers enable row level security;
alter table public.dealer_members enable row level security;

-- -----------------
-- profiles policies
-- -----------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all"
  on public.profiles
  for update
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------------
-- access_requests policies
-- -----------------------
drop policy if exists "access_requests_insert_anyone" on public.access_requests;
create policy "access_requests_insert_anyone"
  on public.access_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "access_requests_admin_select" on public.access_requests;
create policy "access_requests_admin_select"
  on public.access_requests
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "access_requests_admin_update" on public.access_requests;
create policy "access_requests_admin_update"
  on public.access_requests
  for update
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------
-- products policies
-- -----------------
drop policy if exists "products_provider_all" on public.products;
create policy "products_provider_all"
  on public.products
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "products_dealer_select_published" on public.products;
create policy "products_dealer_select_published"
  on public.products
  for select
  to authenticated
  using (
    published = true
    and public.current_role() in ('DEALER','DEALER_ADMIN','ADMIN','SUPER_ADMIN')
  );

drop policy if exists "products_admin_select_all" on public.products;
create policy "products_admin_select_all"
  on public.products
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "product_pricing_provider_all" on public.product_pricing;
create policy "product_pricing_provider_all"
  on public.product_pricing
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "product_pricing_dealer_select_published" on public.product_pricing;
create policy "product_pricing_dealer_select_published"
  on public.product_pricing
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and exists (
      select 1
      from public.products pr
      where pr.id = product_pricing.product_id
        and pr.published = true
    )
  );

drop policy if exists "product_pricing_admin_select_all" on public.product_pricing;
create policy "product_pricing_admin_select_all"
  on public.product_pricing
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------
-- dealers policies
-- -----------------
drop policy if exists "dealers_admin_all" on public.dealers;
create policy "dealers_admin_all"
  on public.dealers
  for all
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "dealers_member_select" on public.dealers;
create policy "dealers_member_select"
  on public.dealers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_members dm
      where dm.dealer_id = dealers.id
        and dm.user_id = auth.uid()
        and dm.status = 'ACTIVE'
    )
  );

drop policy if exists "dealers_dealer_admin_update_markup" on public.dealers;
create policy "dealers_dealer_admin_update_markup"
  on public.dealers
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_members dm
      where dm.dealer_id = dealers.id
        and dm.user_id = auth.uid()
        and dm.status = 'ACTIVE'
        and dm.role = 'DEALER_ADMIN'
    )
  )
  with check (
    markup_pct >= 0 and markup_pct <= 200
    and name is not distinct from (select old.name from public.dealers old where old.id = dealers.id)
    and created_at is not distinct from (select old.created_at from public.dealers old where old.id = dealers.id)
  );

-- ------------------------
-- dealer_members policies
-- ------------------------
drop policy if exists "dealer_members_admin_all" on public.dealer_members;
create policy "dealer_members_admin_all"
  on public.dealer_members
  for all
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "dealer_members_member_select" on public.dealer_members;
create policy "dealer_members_member_select"
  on public.dealer_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- -----------------
-- contracts policies
-- -----------------
-- Dealer-scoped access:
-- - Dealers/Dealer Admin: can read contracts in their dealer_id
-- - Dealers: can insert/update their dealer_id
-- - Dealer Admin: read-only (no insert/update)
-- - Admin/Super Admin: can read all, can update all

drop policy if exists "contracts_select_all_authenticated" on public.contracts;

drop policy if exists "contracts_select_admin" on public.contracts;
create policy "contracts_select_admin"
  on public.contracts
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "contracts_select_dealer_scope" on public.contracts;
create policy "contracts_select_dealer_scope"
  on public.contracts
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and contracts.dealer_id = public.current_dealer_id()
  );

drop policy if exists "contracts_dealer_write" on public.contracts;
create policy "contracts_dealer_write"
  on public.contracts
  for insert
  to authenticated
  with check (
    public.current_role() in ('DEALER')
    and contracts.dealer_id = public.current_dealer_id()
  );

drop policy if exists "contracts_dealer_update" on public.contracts;
create policy "contracts_dealer_update"
  on public.contracts
  for update
  to authenticated
  using (
    public.current_role() in ('DEALER')
    and contracts.dealer_id = public.current_dealer_id()
  )
  with check (
    public.current_role() in ('DEALER')
    and contracts.dealer_id = public.current_dealer_id()
  );

drop policy if exists "contracts_admin_update" on public.contracts;
create policy "contracts_admin_update"
  on public.contracts
  for update
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------
-- remittances policies
-- -----------------
drop policy if exists "remittances_select_all_authenticated" on public.remittances;

drop policy if exists "remittances_select_admin" on public.remittances;
create policy "remittances_select_admin"
  on public.remittances
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "remittances_select_dealer_scope" on public.remittances;
create policy "remittances_select_dealer_scope"
  on public.remittances
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and remittances.dealer_id = public.current_dealer_id()
  );

drop policy if exists "remittances_dealer_admin_write" on public.remittances;
create policy "remittances_dealer_admin_write"
  on public.remittances
  for insert
  to authenticated
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and remittances.dealer_id = public.current_dealer_id()
  );

drop policy if exists "remittances_admin_update" on public.remittances;
create policy "remittances_admin_update"
  on public.remittances
  for update
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------
-- batches policies
-- -----------------
drop policy if exists "batches_select_all_authenticated" on public.batches;

drop policy if exists "batches_select_admin" on public.batches;
create policy "batches_select_admin"
  on public.batches
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "batches_select_dealer_scope" on public.batches;
create policy "batches_select_dealer_scope"
  on public.batches
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and batches.dealer_id = public.current_dealer_id()
  );

drop policy if exists "batches_dealer_admin_write" on public.batches;
create policy "batches_dealer_admin_write"
  on public.batches
  for insert
  to authenticated
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and batches.dealer_id = public.current_dealer_id()
  );

drop policy if exists "batches_admin_update" on public.batches;
create policy "batches_admin_update"
  on public.batches
  for update
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- -----------------
-- employees policies
-- -----------------
drop policy if exists "employees_select_all_authenticated" on public.employees;

drop policy if exists "employees_select_admin" on public.employees;
create policy "employees_select_admin"
  on public.employees
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "employees_select_dealer_scope" on public.employees;
create policy "employees_select_dealer_scope"
  on public.employees
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and employees.dealer_id = public.current_dealer_id()
  );

drop policy if exists "employees_dealer_admin_write" on public.employees;
create policy "employees_dealer_admin_write"
  on public.employees
  for all
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and employees.dealer_id = public.current_dealer_id()
  )
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and employees.dealer_id = public.current_dealer_id()
  );

-- ------------------------
-- product_documents policies
-- ------------------------
drop policy if exists "product_documents_provider_all" on public.product_documents;
create policy "product_documents_provider_all"
  on public.product_documents
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "product_documents_dealer_select_published" on public.product_documents;
create policy "product_documents_dealer_select_published"
  on public.product_documents
  for select
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN')
    and product_id is not null
    and exists (
      select 1
      from public.products pr
      where pr.id = product_documents.product_id
        and pr.published = true
    )
  );

drop policy if exists "product_documents_admin_select" on public.product_documents;
create policy "product_documents_admin_select"
  on public.product_documents
  for select
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'));

-- ---------------------------
-- provider_team_members policies
-- ---------------------------
drop policy if exists "provider_team_members_provider_all" on public.provider_team_members;
create policy "provider_team_members_provider_all"
  on public.provider_team_members
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- -----------------
-- storage policies
-- -----------------
alter table storage.objects enable row level security;

drop policy if exists "product_documents_storage_select" on storage.objects;
create policy "product_documents_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        public.current_role() in ('DEALER','DEALER_ADMIN')
        and exists (
          select 1
          from public.product_documents pd
          join public.products pr on pr.id = pd.product_id
          where pd.storage_path = storage.objects.name
            and pr.published = true
        )
      )
    )
  );

drop policy if exists "product_documents_storage_insert" on storage.objects;
create policy "product_documents_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product_documents_storage_update" on storage.objects;
create policy "product_documents_storage_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "product_documents_storage_delete" on storage.objects;
create policy "product_documents_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
