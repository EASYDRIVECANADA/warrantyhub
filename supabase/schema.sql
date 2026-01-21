create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('UNASSIGNED','ADMIN','SUPER_ADMIN','DEALER','DEALER_ADMIN','PROVIDER')),
  email text,
  display_name text,
  company_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists company_name text;

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (
      role = 'PROVIDER'
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','ADMIN','SUPER_ADMIN')
      )
    )
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and role = 'UNASSIGNED'
    and is_active = false
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (
      select p.role from public.profiles p
      where p.id = auth.uid()
    )
    and is_active = (
      select p.is_active from public.profiles p
      where p.id = auth.uid()
    )
    and coalesce(email,'') = coalesce((
      select p.email from public.profiles p
      where p.id = auth.uid()
    ),'')
  );

drop policy if exists "profiles_select_admin_all" on public.profiles;
create policy "profiles_select_admin_all"
  on public.profiles
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ));

drop policy if exists "profiles_update_admin_all" on public.profiles;
create policy "profiles_update_admin_all"
  on public.profiles
  for update
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ))
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
    )
    and (
      select old.role from public.profiles old
      where old.id = public.profiles.id
    ) <> 'SUPER_ADMIN'
    and role <> 'SUPER_ADMIN'
    and (
      (
        exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'ADMIN')
        and (
          select old.role from public.profiles old
          where old.id = public.profiles.id
        ) not in ('ADMIN','SUPER_ADMIN')
        and role in ('UNASSIGNED','DEALER','DEALER_ADMIN','PROVIDER')
      )
      or
      (
        exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'SUPER_ADMIN')
        and (
          role = (
            select old.role from public.profiles old
            where old.id = public.profiles.id
          )
          or role in ('UNASSIGNED','DEALER','PROVIDER','ADMIN')
        )
      )
    )
  );

create table if not exists public.access_request_audit (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null,
  action text not null check (action in ('APPROVED','REJECTED')),
  from_status text,
  to_status text,
  assigned_role text,
  assigned_company text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

alter table public.access_request_audit enable row level security;

drop policy if exists "access_request_audit_select_admin" on public.access_request_audit;
create policy "access_request_audit_select_admin"
  on public.access_request_audit
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ));

drop policy if exists "access_request_audit_insert_admin" on public.access_request_audit;
create policy "access_request_audit_insert_admin"
  on public.access_request_audit
  for insert
  to authenticated
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ));

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dealer_members (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('DEALER','DEALER_ADMIN')),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  unique (dealer_id, user_id)
);

alter table public.dealers enable row level security;
alter table public.dealer_members enable row level security;

drop policy if exists "dealers_all_authenticated" on public.dealers;
create policy "dealers_all_authenticated"
  on public.dealers
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "dealer_members_all_authenticated" on public.dealer_members;
create policy "dealer_members_all_authenticated"
  on public.dealer_members
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('DEALER','PROVIDER')),
  company text not null,
  name text not null,
  email text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_requests
  add column if not exists requester_id uuid references auth.users(id) on delete set null;

alter table public.access_requests
  add column if not exists message text;

alter table public.access_requests
  add column if not exists status text not null default 'PENDING'
  check (status in ('PENDING','APPROVED','REJECTED'));

alter table public.access_requests
  add column if not exists reviewed_at timestamptz;

alter table public.access_requests
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.access_requests
  add column if not exists reviewed_by_email text;

alter table public.access_requests
  add column if not exists rejection_message text;

alter table public.access_requests
  add column if not exists assigned_role text
  check (assigned_role in ('DEALER','DEALER_ADMIN','PROVIDER','ADMIN'));

do $$
begin
  alter table public.access_requests
    drop constraint if exists access_requests_assigned_role_check;

  alter table public.access_requests
    add constraint access_requests_assigned_role_check
    check (assigned_role in ('DEALER','DEALER_ADMIN','PROVIDER','ADMIN'));
exception
  when duplicate_object then null;
end $$;

alter table public.access_requests
  add column if not exists assigned_company text;

do $$
begin
  alter table public.access_request_audit
    drop constraint if exists access_request_audit_access_request_id_fkey;

  alter table public.access_request_audit
    add constraint access_request_audit_access_request_id_fkey
    foreign key (access_request_id) references public.access_requests(id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

alter table public.access_requests enable row level security;

drop policy if exists "access_requests_insert_anyone" on public.access_requests;
drop policy if exists "access_requests_insert_authenticated_own" on public.access_requests;
create policy "access_requests_insert_authenticated_own"
  on public.access_requests
  for insert
  to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "access_requests_select_own" on public.access_requests;
create policy "access_requests_select_own"
  on public.access_requests
  for select
  to authenticated
  using (requester_id = auth.uid());

drop policy if exists "access_requests_select_admin" on public.access_requests;
create policy "access_requests_select_admin"
  on public.access_requests
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ));

drop policy if exists "access_requests_update_admin" on public.access_requests;
create policy "access_requests_update_admin"
  on public.access_requests
  for update
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ))
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
    )
    and (
      status <> 'APPROVED'
      or (assigned_role is not null and assigned_company is not null)
    )
    and (
      assigned_role is null
      or (
        (
          exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'ADMIN')
          and assigned_role in ('DEALER','DEALER_ADMIN','PROVIDER')
        )
        or
        (
          exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'SUPER_ADMIN')
          and (
            assigned_role = (
              select ar.assigned_role from public.access_requests ar
              where ar.id = public.access_requests.id
            )
            or assigned_role in ('DEALER','PROVIDER','ADMIN')
          )
        )
      )
    )
  );

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null,
  customer_name text not null,
  created_at timestamptz not null default now()
);

alter table public.contracts
  add column if not exists warranty_id text;

alter table public.contracts
  add column if not exists status text not null default 'DRAFT'
  check (status in ('DRAFT','SOLD','REMITTED','PAID'));

alter table public.contracts
  add column if not exists updated_at timestamptz not null default now();

alter table public.contracts
  add column if not exists customer_email text;

alter table public.contracts
  add column if not exists customer_phone text;

alter table public.contracts
  add column if not exists customer_address text;

alter table public.contracts
  add column if not exists customer_city text;

alter table public.contracts
  add column if not exists customer_province text;

alter table public.contracts
  add column if not exists customer_postal_code text;

alter table public.contracts
  add column if not exists vin text;

alter table public.contracts
  add column if not exists vehicle_year text;

alter table public.contracts
  add column if not exists vehicle_make text;

alter table public.contracts
  add column if not exists vehicle_model text;

alter table public.contracts
  add column if not exists vehicle_trim text;

alter table public.contracts
  add column if not exists vehicle_body_class text;

alter table public.contracts
  add column if not exists vehicle_engine text;

alter table public.contracts
  add column if not exists vehicle_transmission text;

alter table public.contracts
  add column if not exists vehicle_mileage_km integer;

alter table public.contracts
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.contracts
  add column if not exists provider_id uuid references public.profiles(id) on delete set null;

alter table public.contracts
  add column if not exists product_id uuid;

alter table public.contracts
  add column if not exists created_by_user_id text;

alter table public.contracts
  add column if not exists created_by_email text;

alter table public.contracts
  add column if not exists sold_by_user_id text;

alter table public.contracts
  add column if not exists sold_by_email text;

alter table public.contracts
  add column if not exists sold_at timestamptz;

alter table public.contracts
  add column if not exists remitted_by_user_id text;

alter table public.contracts
  add column if not exists remitted_by_email text;

alter table public.contracts
  add column if not exists remitted_at timestamptz;

alter table public.contracts
  add column if not exists paid_by_user_id text;

alter table public.contracts
  add column if not exists paid_by_email text;

alter table public.contracts
  add column if not exists paid_at timestamptz;

alter table public.contracts enable row level security;

drop policy if exists "contracts_all_authenticated" on public.contracts;
create policy "contracts_all_authenticated"
  on public.contracts
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  remittance_number text not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

alter table public.remittances
  add column if not exists status text not null default 'DUE'
  check (status in ('DUE','PAID'));

alter table public.remittances
  add column if not exists updated_at timestamptz not null default now();

alter table public.remittances
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.remittances enable row level security;

drop policy if exists "remittances_all_authenticated" on public.remittances;
create policy "remittances_all_authenticated"
  on public.remittances
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  status text not null check (status in ('OPEN','CLOSED')),
  created_at timestamptz not null default now()
);

alter table public.batches
  add column if not exists payment_status text not null default 'UNPAID'
  check (payment_status in ('UNPAID','PAID'));

alter table public.batches
  add column if not exists contract_ids uuid[] not null default '{}';

alter table public.batches
  add column if not exists subtotal_cents integer not null default 0;

alter table public.batches
  add column if not exists tax_rate double precision not null default 0;

alter table public.batches
  add column if not exists tax_cents integer not null default 0;

alter table public.batches
  add column if not exists total_cents integer not null default 0;

alter table public.batches
  add column if not exists paid_at timestamptz;

alter table public.batches
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.batches enable row level security;

drop policy if exists "batches_all_authenticated" on public.batches;
create policy "batches_all_authenticated"
  on public.batches
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.employees
  add column if not exists dealer_id uuid references public.dealers(id) on delete set null;

alter table public.employees enable row level security;

drop policy if exists "employees_all_authenticated" on public.employees;
create policy "employees_all_authenticated"
  on public.employees
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  product_type text not null
    check (product_type in ('EXTENDED_WARRANTY','GAP','TIRE_RIM','APPEARANCE','OTHER')),
  coverage_details text,
  exclusions text,
  term_months integer,
  term_km integer,
  deductible_cents integer,
  eligibility_max_vehicle_age_years integer,
  eligibility_max_mileage_km integer,
  base_price_cents integer,
  dealer_cost_cents integer,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.contracts
    drop constraint if exists contracts_product_id_fkey;

  alter table public.contracts
    add constraint contracts_product_id_fkey
    foreign key (product_id) references public.products(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

alter table public.products
  add column if not exists dealer_cost_cents integer;

alter table public.products
  add column if not exists eligibility_make_allowlist text[];

alter table public.products
  add column if not exists eligibility_model_allowlist text[];

alter table public.products
  add column if not exists eligibility_trim_allowlist text[];

alter table public.products enable row level security;

drop policy if exists "products_provider_own" on public.products;
create policy "products_provider_own"
  on public.products
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "products_select_published_dealer" on public.products;
create policy "products_select_published_dealer"
  on public.products
  for select
  to authenticated
  using (
    published = true
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','ADMIN','SUPER_ADMIN')
    )
  );

create table if not exists public.product_pricing (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  term_months integer not null,
  term_km integer not null,
  deductible_cents integer not null,
  base_price_cents integer not null,
  dealer_cost_cents integer,
  created_at timestamptz not null default now(),
  unique (product_id, term_months, term_km, deductible_cents)
);

alter table public.product_pricing enable row level security;

drop policy if exists "product_pricing_provider_own" on public.product_pricing;
create policy "product_pricing_provider_own"
  on public.product_pricing
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "product_pricing_select_dealer_published" on public.product_pricing;
create policy "product_pricing_select_dealer_published"
  on public.product_pricing
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products pr
      where pr.id = product_pricing.product_id
        and pr.published = true
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','ADMIN','SUPER_ADMIN')
    )
  );

drop policy if exists "product_pricing_select_admin_all" on public.product_pricing;
create policy "product_pricing_select_admin_all"
  on public.product_pricing
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  ));

create table if not exists public.product_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.product_documents enable row level security;

drop policy if exists "product_documents_provider_own" on public.product_documents;
create policy "product_documents_provider_own"
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
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','ADMIN','SUPER_ADMIN')
    )
    and product_id is not null
    and exists (
      select 1 from public.products pr
      where pr.id = product_documents.product_id
        and pr.published = true
    )
  );

create table if not exists public.provider_team_members (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN','PRODUCT_MANAGER','SUPPORT')),
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','DISABLED')),
  created_at timestamptz not null default now()
);

alter table public.provider_team_members enable row level security;

drop policy if exists "provider_team_members_provider_own" on public.provider_team_members;
create policy "provider_team_members_provider_own"
  on public.provider_team_members
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

do $$
begin
  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('product-documents', 'product-documents', false)
    on conflict (id) do nothing;
  $sql$;

  execute $sql$
    alter table storage.objects enable row level security;
  $sql$;

  execute $sql$
    drop policy if exists "product_documents_storage_select" on storage.objects;
  $sql$;

  execute $sql$
    create policy "product_documents_storage_select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'product-documents'
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
          )
          or exists (
            select 1
            from public.product_documents pd
            join public.products pr on pr.id = pd.product_id
            where pd.storage_path = storage.objects.name
              and pr.published = true
          )
        )
      );
  $sql$;

  execute $sql$
    drop policy if exists "product_documents_storage_insert" on storage.objects;
  $sql$;

  execute $sql$
    create policy "product_documents_storage_insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'product-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $sql$;

  execute $sql$
    drop policy if exists "product_documents_storage_update" on storage.objects;
  $sql$;

  execute $sql$
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
  $sql$;

  execute $sql$
    drop policy if exists "product_documents_storage_delete" on storage.objects;
  $sql$;

  execute $sql$
    create policy "product_documents_storage_delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'product-documents'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $sql$;
exception
  when insufficient_privilege then null;
end $$;
