create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('UNASSIGNED','ADMIN','SUPER_ADMIN','DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','PROVIDER')),
  email text,
  display_name text,
  company_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  begin
    alter table public.profiles
      drop constraint profiles_role_check;
  exception
    when undefined_object then null;
  end;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('UNASSIGNED','ADMIN','SUPER_ADMIN','DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','PROVIDER'));
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists company_name text;

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

alter table public.profiles
  add column if not exists provider_company_id uuid;

alter table public.profiles
  add column if not exists provider_logo_url text;

alter table public.profiles
  add column if not exists provider_terms_text text;

alter table public.profiles
  add column if not exists provider_terms_conditions_text text;

alter table public.profiles
  add column if not exists provider_claims_repairs_text text;

alter table public.profiles
  add column if not exists provider_responsibility_text text;

alter table public.profiles
  add column if not exists provider_limitation_liability_text text;

alter table public.profiles
  add column if not exists provider_customer_ack_text text;

alter table public.profiles
  add column if not exists first_name text;

alter table public.profiles
  add column if not exists last_name text;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'SUPER_ADMIN'
  );
$$;

create or replace function public.is_dealer_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','ADMIN','SUPER_ADMIN')
  );
$$;

create or replace function public.is_active_dealer_member(target_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_members dm
    where dm.dealer_id = target_dealer_id
      and dm.user_id = auth.uid()
      and dm.status = 'ACTIVE'
  );
$$;

create or replace function public.can_update_profile(target_id uuid, new_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and new_role <> 'SUPER_ADMIN'
    and (
      (select old.role from public.profiles old where old.id = target_id) <> 'SUPER_ADMIN'
    );
$$;

create or replace function public.provider_company_id_unchanged(target_id uuid, new_provider_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select old.provider_company_id from public.profiles old where old.id = target_id)
    is not distinct from new_provider_company_id
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (
      role = 'PROVIDER'
      and public.is_dealer_or_admin()
    )
  );

drop policy if exists "profiles_select_dealer_admin_team" on public.profiles;
create policy "profiles_select_dealer_admin_team"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_members dm_target
      join public.dealer_members dm_admin
        on dm_admin.dealer_id = dm_target.dealer_id
      where dm_target.user_id = profiles.id
        and dm_admin.user_id = auth.uid()
        and dm_admin.status = 'ACTIVE'
        and dm_admin.role = 'DEALER_ADMIN'
    )
  );

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_email text,
  user_role text,
  user_company_name text,
  status text not null default 'OPEN' check (status in ('OPEN','PENDING','CLOSED')),
  last_sender_type text check (last_sender_type in ('USER','ADMIN')),
  admin_last_read_at timestamptz,
  user_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

do $$
begin
  alter table public.support_conversations
    drop constraint if exists support_conversations_status_check;

  alter table public.support_conversations
    add constraint support_conversations_status_check
    check (status in ('OPEN','PENDING','CLOSED'));
exception
  when duplicate_object then null;
end $$;

alter table public.support_conversations
  add column if not exists user_email text;

alter table public.support_conversations
  add column if not exists user_role text;

alter table public.support_conversations
  add column if not exists user_company_name text;

alter table public.support_conversations
  add column if not exists last_sender_type text;

alter table public.support_conversations
  add column if not exists admin_last_read_at timestamptz;

alter table public.support_conversations
  add column if not exists user_last_read_at timestamptz;

do $$
begin
  alter table public.support_conversations
    drop constraint if exists support_conversations_user_id_key;

  alter table public.support_conversations
    add constraint support_conversations_user_id_key unique (user_id);
exception
  when duplicate_object then null;
end $$;

alter table public.support_conversations enable row level security;

drop policy if exists "support_conversations_insert_own" on public.support_conversations;
create policy "support_conversations_insert_own"
  on public.support_conversations
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "support_conversations_select_own" on public.support_conversations;
create policy "support_conversations_select_own"
  on public.support_conversations
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_conversations_select_admin" on public.support_conversations;
create policy "support_conversations_select_admin"
  on public.support_conversations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "support_conversations_update_own" on public.support_conversations;
create policy "support_conversations_update_own"
  on public.support_conversations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.support_conversations_enforce_user_fields()
returns trigger
language plpgsql
as $$
declare
  p_email text;
  p_role text;
  p_company text;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Invalid user_id for support conversation';
  end if;

  select email, role, company_name
    into p_email, p_role, p_company
  from public.profiles
  where id = auth.uid();

  new.user_email := p_email;
  new.user_role := p_role;
  new.user_company_name := p_company;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Cannot change user_id';
    end if;

    if new.admin_last_read_at is distinct from old.admin_last_read_at then
      raise exception 'Only admins can update admin_last_read_at';
    end if;

    if new.last_sender_type is distinct from old.last_sender_type then
      if new.last_sender_type <> 'USER' then
        raise exception 'Only admins can set last_sender_type to %', new.last_sender_type;
      end if;
    end if;

    if new.status is distinct from old.status then
      if new.status <> 'OPEN' then
        raise exception 'Only admins can set support conversation status to %', new.status;
      end if;
    end if;
  else
    if new.last_sender_type is not null and new.last_sender_type <> 'USER' then
      raise exception 'Only admins can set last_sender_type to %', new.last_sender_type;
    end if;

    if new.status <> 'OPEN' then
      raise exception 'Only admins can set support conversation status to %', new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_support_conversations_block_user_status_changes on public.support_conversations;
create trigger trg_support_conversations_block_user_status_changes
before insert or update on public.support_conversations
for each row
execute function public.support_conversations_enforce_user_fields();

drop policy if exists "support_conversations_update_admin" on public.support_conversations;
create policy "support_conversations_update_admin"
  on public.support_conversations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  sender_type text not null check (sender_type in ('USER','ADMIN')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

drop policy if exists "support_messages_select_own" on public.support_messages;
create policy "support_messages_select_own"
  on public.support_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_select_admin" on public.support_messages;
create policy "support_messages_select_admin"
  on public.support_messages
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "support_messages_insert_own" on public.support_messages;
create policy "support_messages_insert_own"
  on public.support_messages
  for insert
  to authenticated
  with check (
    sender_type = 'USER'
    and sender_user_id = auth.uid()
    and exists (
      select 1
      from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_insert_admin" on public.support_messages;
create policy "support_messages_insert_admin"
  on public.support_messages
  for insert
  to authenticated
  with check (
    sender_type = 'ADMIN'
    and sender_user_id = auth.uid()
    and public.is_admin()
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
    and public.provider_company_id_unchanged(id, provider_company_id)
  );

drop policy if exists "profiles_select_admin_all" on public.profiles;
create policy "profiles_select_admin_all"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "profiles_update_admin_all" on public.profiles;
create policy "profiles_update_admin_all"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (
    public.can_update_profile(public.profiles.id, public.profiles.role)
    and (
      public.current_role() = 'SUPER_ADMIN'
      or public.provider_company_id_unchanged(public.profiles.id, public.profiles.provider_company_id)
    )
  );

drop policy if exists "storage_provider_logos_insert_own" on storage.objects;
create policy "storage_provider_logos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "storage_provider_logos_update_own" on storage.objects;
create policy "storage_provider_logos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "storage_provider_logos_delete_own" on storage.objects;
create policy "storage_provider_logos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "storage_provider_logos_select_public" on storage.objects;
create policy "storage_provider_logos_select_public"
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
  );

drop policy if exists "storage_provider_logos_select_authenticated" on storage.objects;
create policy "storage_provider_logos_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-documents'
    and (storage.foldername(name))[1] = 'provider-logos'
  );

create table if not exists public.provider_companies (
  id uuid primary key default gen_random_uuid(),
  provider_company_name text not null,
  legal_business_name text not null,
  business_type text not null default 'WARRANTY_PROVIDER' check (business_type in ('WARRANTY_PROVIDER')),
  contact_email text not null,
  status text not null default 'PENDING' check (status in ('ACTIVE','PENDING','SUSPENDED')),
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_provider_company_id_fkey;

  alter table public.profiles
    add constraint profiles_provider_company_id_fkey
    foreign key (provider_company_id) references public.provider_companies(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

alter table public.provider_companies enable row level security;

drop policy if exists "provider_companies_select_super_admin" on public.provider_companies;
create policy "provider_companies_select_super_admin"
  on public.provider_companies
  for select
  to authenticated
  using (public.is_super_admin());

drop policy if exists "provider_companies_insert_super_admin" on public.provider_companies;
create policy "provider_companies_insert_super_admin"
  on public.provider_companies
  for insert
  to authenticated
  with check (public.is_super_admin());

drop policy if exists "provider_companies_update_super_admin" on public.provider_companies;
create policy "provider_companies_update_super_admin"
  on public.provider_companies
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

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
  using (public.is_admin());

drop policy if exists "access_request_audit_insert_admin" on public.access_request_audit;
create policy "access_request_audit_insert_admin"
  on public.access_request_audit
  for insert
  to authenticated
  with check (public.is_admin());

create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  markup_pct numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.dealers
  add column if not exists stripe_customer_id text;

alter table public.dealers
  add column if not exists stripe_subscription_id text;

alter table public.dealers
  add column if not exists subscription_status text;

alter table public.dealers
  add column if not exists subscription_plan_key text;

alter table public.dealers
  add column if not exists subscription_price_id text;

alter table public.dealers
  add column if not exists subscription_trial_end timestamptz;

alter table public.dealers
  add column if not exists subscription_current_period_end timestamptz;

alter table public.dealers
  add column if not exists subscription_cancel_at_period_end boolean not null default false;

alter table public.dealers
  add column if not exists subscription_seats_limit integer;

alter table public.dealers
  add column if not exists contract_fee_cents integer;

do $$
begin
  alter table public.dealers
    drop constraint if exists dealers_subscription_plan_key_check;

  alter table public.dealers
    add constraint dealers_subscription_plan_key_check
    check (subscription_plan_key is null or subscription_plan_key in ('STANDARD','EARLY_ADOPTER'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.is_dealer_subscription_active(target_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealers d
    where d.id = target_dealer_id
      and (
        d.subscription_status in ('active','trialing')
        or (
          d.subscription_status = 'canceled'
          and d.subscription_current_period_end is not null
          and d.subscription_current_period_end > now()
        )
      )
  );
$$;

create or replace function public.enforce_standard_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan text;
  seats integer;
  active_count integer;
begin
  select d.subscription_plan_key, d.subscription_seats_limit
    into plan, seats
  from public.dealers d
  where d.id = new.dealer_id;

  if plan is distinct from 'STANDARD' then
    return new;
  end if;

  if seats is null then
    return new;
  end if;

  if (new.status is distinct from 'ACTIVE') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*)
      into active_count
    from public.dealer_members dm
    where dm.dealer_id = new.dealer_id
      and dm.status = 'ACTIVE';
  else
    select count(*)
      into active_count
    from public.dealer_members dm
    where dm.dealer_id = new.dealer_id
      and dm.status = 'ACTIVE'
      and dm.id <> old.id;
  end if;

  if active_count >= seats then
    raise exception 'Seat limit reached for this dealership plan';
  end if;

  return new;
end;
$$;

do $$
begin
  alter table public.dealers
    drop constraint if exists dealers_markup_pct_check;

  alter table public.dealers
    add constraint dealers_markup_pct_check
    check (markup_pct >= 0 and markup_pct <= 200);
exception
  when duplicate_object then null;
end $$;

create table if not exists public.dealer_members (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  unique (dealer_id, user_id)
);

drop trigger if exists trg_dealer_members_enforce_standard_seat_limit on public.dealer_members;
create trigger trg_dealer_members_enforce_standard_seat_limit
before insert or update on public.dealer_members
for each row
execute function public.enforce_standard_seat_limit();

do $$
begin
  alter table public.dealer_members
    drop constraint if exists dealer_members_role_check;

  alter table public.dealer_members
    add constraint dealer_members_role_check
    check (role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE'));
exception
  when duplicate_object then null;
end $$;

alter table public.dealers enable row level security;
alter table public.dealer_members enable row level security;

drop policy if exists "dealers_all_authenticated" on public.dealers;

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
  with check (markup_pct >= 0 and markup_pct <= 200);

drop policy if exists "dealer_members_all_authenticated" on public.dealer_members;

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

drop policy if exists "dealer_members_dealer_admin_select_team" on public.dealer_members;
create policy "dealer_members_dealer_admin_select_team"
  on public.dealer_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_members dm_admin
      where dm_admin.dealer_id = dealer_members.dealer_id
        and dm_admin.user_id = auth.uid()
        and dm_admin.status = 'ACTIVE'
        and dm_admin.role = 'DEALER_ADMIN'
    )
  );

create table if not exists public.dealer_employee_invites (
  dealer_id uuid primary key references public.dealers(id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealer_employee_invites enable row level security;

drop policy if exists "dealer_employee_invites_admin_all" on public.dealer_employee_invites;
create policy "dealer_employee_invites_admin_all"
  on public.dealer_employee_invites
  for all
  to authenticated
  using (public.current_role() in ('ADMIN','SUPER_ADMIN'))
  with check (public.current_role() in ('ADMIN','SUPER_ADMIN'));

drop policy if exists "dealer_employee_invites_dealer_admin_manage" on public.dealer_employee_invites;
create policy "dealer_employee_invites_dealer_admin_manage"
  on public.dealer_employee_invites
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_members dm
      where dm.dealer_id = dealer_employee_invites.dealer_id
        and dm.user_id = auth.uid()
        and dm.status = 'ACTIVE'
        and dm.role = 'DEALER_ADMIN'
    )
  )
  with check (
    exists (
      select 1
      from public.dealer_members dm
      where dm.dealer_id = dealer_employee_invites.dealer_id
        and dm.user_id = auth.uid()
        and dm.status = 'ACTIVE'
        and dm.role = 'DEALER_ADMIN'
    )
  );

create or replace function public.join_dealer_by_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  did uuid;
  dname text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select i.dealer_id into did
  from public.dealer_employee_invites i
  where upper(trim(i.code)) = upper(trim(invite_code))
  limit 1;

  if did is null then
    raise exception 'Invalid invite code';
  end if;

  select d.name into dname
  from public.dealers d
  where d.id = did;

  insert into public.dealer_members (dealer_id, user_id, role, status)
  values (did, auth.uid(), 'DEALER_EMPLOYEE', 'ACTIVE')
  on conflict (dealer_id, user_id)
  do update set role = 'DEALER_EMPLOYEE', status = 'ACTIVE';

  update public.profiles
  set role = 'DEALER_EMPLOYEE',
      is_active = true,
      company_name = coalesce(dname, company_name)
  where id = auth.uid();
end;
$$;

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
  using (public.is_admin());

drop policy if exists "access_requests_update_admin" on public.access_requests;
create policy "access_requests_update_admin"
  on public.access_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and (
      status <> 'APPROVED'
      or (assigned_role is not null and assigned_company is not null)
    )
    and (
      assigned_role is null
      or (
        (
          public.current_role() = 'ADMIN'
          and assigned_role in ('DEALER','DEALER_ADMIN','PROVIDER')
        )
        or
        (
          public.current_role() = 'SUPER_ADMIN'
          and assigned_role in ('DEALER','DEALER_ADMIN','PROVIDER','ADMIN')
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
  add column if not exists product_pricing_id uuid;

alter table public.contracts
  add column if not exists pricing_term_months integer;

alter table public.contracts
  add column if not exists pricing_term_km integer;

alter table public.contracts
  add column if not exists pricing_deductible_cents integer;

alter table public.contracts
  add column if not exists pricing_base_price_cents integer;

alter table public.contracts
  add column if not exists pricing_dealer_cost_cents integer;

alter table public.contracts
  add column if not exists pricing_vehicle_mileage_min_km integer;

alter table public.contracts
  add column if not exists pricing_vehicle_mileage_max_km integer;

alter table public.contracts
  add column if not exists pricing_vehicle_class text;

alter table public.contracts
  add column if not exists contract_processing_fee_cents integer;

alter table public.contracts
  add column if not exists stripe_payment_intent_id text;

alter table public.contracts
  add column if not exists stripe_payment_intent_status text;

alter table public.contracts
  add column if not exists processing_fee_paid_at timestamptz;

alter table public.contracts
  add column if not exists addon_snapshot jsonb;

alter table public.contracts
  add column if not exists addon_total_retail_cents integer;

alter table public.contracts
  add column if not exists addon_total_cost_cents integer;

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
drop policy if exists "contracts_admin_all" on public.contracts;
create policy "contracts_admin_all"
  on public.contracts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "contracts_provider_own" on public.contracts;
create policy "contracts_provider_own"
  on public.contracts
  for select
  to authenticated
  using (
    public.current_role() = 'PROVIDER'
    and provider_id = auth.uid()
  );

drop policy if exists "contracts_dealer_member" on public.contracts;
create policy "contracts_dealer_member"
  on public.contracts
  for all
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  )
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  );

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

alter table public.remittances
  add column if not exists provider_id uuid references public.profiles(id) on delete set null;

alter table public.remittances enable row level security;

drop policy if exists "remittances_all_authenticated" on public.remittances;
drop policy if exists "remittances_admin_all" on public.remittances;
create policy "remittances_admin_all"
  on public.remittances
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "remittances_provider_own" on public.remittances;
create policy "remittances_provider_own"
  on public.remittances
  for select
  to authenticated
  using (
    public.current_role() = 'PROVIDER'
    and provider_id = auth.uid()
  );

drop policy if exists "remittances_dealer_member" on public.remittances;
create policy "remittances_dealer_member"
  on public.remittances
  for all
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  )
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  );

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

alter table public.batches
  add column if not exists provider_id uuid references public.profiles(id) on delete set null;

alter table public.batches enable row level security;

drop policy if exists "batches_all_authenticated" on public.batches;
drop policy if exists "batches_admin_all" on public.batches;
create policy "batches_admin_all"
  on public.batches
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "batches_provider_own" on public.batches;
create policy "batches_provider_own"
  on public.batches
  for select
  to authenticated
  using (
    public.current_role() = 'PROVIDER'
    and provider_id = auth.uid()
  );

drop policy if exists "batches_dealer_member" on public.batches;
create policy "batches_dealer_member"
  on public.batches
  for all
  to authenticated
  using (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  )
  with check (
    public.current_role() in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE')
    and public.is_active_dealer_member(dealer_id)
  );

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
  powertrain_eligibility text
    check (powertrain_eligibility in ('ALL','ICE','ELECTRIFIED','HEV','PHEV','BEV')),
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
  add column if not exists key_benefits text;

alter table public.products
  add column if not exists powertrain_eligibility text;

do $$
begin
  alter table public.products
    drop constraint if exists products_powertrain_eligibility_check;
exception
  when undefined_object then null;
end $$;

alter table public.products
  add constraint products_powertrain_eligibility_check
  check (powertrain_eligibility is null or powertrain_eligibility in ('ALL','ICE','ELECTRIFIED','HEV','PHEV','BEV'));

alter table public.products
  add column if not exists coverage_max_ltv_percent integer;

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
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','ADMIN','SUPER_ADMIN')
    )
  );

create table if not exists public.product_pricing (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  term_months integer,
  term_km integer,
  vehicle_mileage_min_km integer,
  vehicle_mileage_max_km integer,
  vehicle_class text,
  claim_limit_cents integer,
  claim_limit_type text,
  claim_limit_amount_cents integer,
  deductible_cents integer not null,
  base_price_cents integer not null,
  dealer_cost_cents integer,
  created_at timestamptz not null default now(),
  unique (
    product_id,
    term_months,
    term_km,
    vehicle_mileage_min_km,
    vehicle_mileage_max_km,
    vehicle_class,
    deductible_cents,
    claim_limit_cents,
    claim_limit_type,
    claim_limit_amount_cents
  )
);

alter table public.product_pricing
  add column if not exists is_default boolean not null default false;

alter table public.product_pricing
  add column if not exists term_months integer;

alter table public.product_pricing
  add column if not exists term_km integer;

alter table public.product_pricing
  add column if not exists vehicle_mileage_min_km integer;

alter table public.product_pricing
  add column if not exists vehicle_mileage_max_km integer;

alter table public.product_pricing
  add column if not exists vehicle_class text;

alter table public.product_pricing
  add column if not exists claim_limit_cents integer;

alter table public.product_pricing
  add column if not exists claim_limit_type text;

alter table public.product_pricing
  add column if not exists claim_limit_amount_cents integer;

create unique index if not exists product_pricing_one_default_per_product
  on public.product_pricing (product_id)
  where is_default;

create unique index if not exists product_pricing_unique_row_coalesced
  on public.product_pricing (
    product_id,
    coalesce(term_months, -1),
    coalesce(term_km, -1),
    coalesce(vehicle_mileage_min_km, -1),
    coalesce(vehicle_mileage_max_km, -1),
    coalesce(vehicle_class, ''),
    deductible_cents,
    coalesce(claim_limit_cents, -1),
    coalesce(claim_limit_type, ''),
    coalesce(claim_limit_amount_cents, -1)
  );

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_term_months_check
    check (term_months is null or term_months > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_term_km_check
    check (term_km is null or term_km > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_vehicle_mileage_min_km_check
    check (vehicle_mileage_min_km is null or vehicle_mileage_min_km >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_vehicle_mileage_max_km_check
    check (vehicle_mileage_max_km is null or vehicle_mileage_max_km >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_vehicle_mileage_band_check
    check (
      vehicle_mileage_min_km is null
      or vehicle_mileage_max_km is null
      or vehicle_mileage_max_km >= vehicle_mileage_min_km
    );
exception
  when duplicate_object then null;
end $$;

do $$claim_limit_type_check
    check (
      claim_limit_type is null
      or claim_limit_type in ('PER_CLAIM','TOTAL_COVERAGE','FMV','MAX_RETAIL')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_claim_limit_amount_cents_check
    check (claim_limit_amount_cents is null or claim_limit_amount_cents > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_claim_limit_amount_required_check
    check (
      claim_limit_type is null
      or claim_limit_type = 'FMV'
      or claim_limit_amount_cents is not null
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_
begin
  alter table public.product_pricing
    add constraint product_pricing_claim_limit_cents_check
    check (claim_limit_cents is null or claim_limit_cents > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_deductible_cents_check
    check (deductible_cents >= 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_base_price_cents_check
    check (base_price_cents > 0);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.product_pricing
    add constraint product_pricing_dealer_cost_cents_check
    check (dealer_cost_cents is null or dealer_cost_cents >= 0);
exception
  when duplicate_object then null;
end $$;

create or replace function public.product_pricing_unset_other_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default is true then
    update public.product_pricing
      set is_default = false
      where product_id = new.product_id
        and id <> new.id
        and is_default is true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_pricing_unset_other_defaults on public.product_pricing;
create trigger trg_product_pricing_unset_other_defaults
  after insert or update of is_default
  on public.product_pricing
  for each row
  execute function public.product_pricing_unset_other_defaults();

create or replace function public.ensure_product_has_default_pricing(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_default boolean;
  first_id uuid;
begin
  select exists(
    select 1 from public.product_pricing
    where product_id = p_product_id and is_default is true
  ) into has_default;

  if has_default then
    return;
  end if;

  select id
    from public.product_pricing
    where product_id = p_product_id
    order by created_at asc
    limit 1
    into first_id;

  if first_id is null then
    raise exception 'Cannot publish product %: no pricing rows exist', p_product_id;
  end if;

  update public.product_pricing
    set is_default = true
    where id = first_id;
end;
$$;

create or replace function public.products_require_default_pricing_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published is true and (old.published is distinct from true) then
    perform public.ensure_product_has_default_pricing(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_require_default_pricing_on_publish on public.products;
create trigger trg_products_require_default_pricing_on_publish
  before update of published
  on public.products
  for each row
  execute function public.products_require_default_pricing_on_publish();

create or replace function public.sync_product_legacy_pricing_from_default(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row record;
begin
  select
    term_months,
    term_km,
    deductible_cents,
    base_price_cents,
    dealer_cost_cents
  into row
  from public.product_pricing
  where product_id = p_product_id
    and is_default is true
  limit 1;

  if row is null then
    update public.products
      set term_months = null,
          term_km = null,
          deductible_cents = null,
          base_price_cents = null,
          dealer_cost_cents = null,
          updated_at = now()
      where id = p_product_id;
    return;
  end if;

  update public.products
    set term_months = row.term_months,
        term_km = row.term_km,
        deductible_cents = row.deductible_cents,
        base_price_cents = row.base_price_cents,
        dealer_cost_cents = row.dealer_cost_cents,
        updated_at = now()
    where id = p_product_id;
end;
$$;

create or replace function public.product_pricing_sync_product_legacy_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  still_has_rows boolean;
begin
  pid := coalesce(new.product_id, old.product_id);
  if pid is null then
    return coalesce(new, old);
  end if;

  select exists(
    select 1 from public.product_pricing where product_id = pid
  ) into still_has_rows;

  if still_has_rows then
    perform public.ensure_product_has_default_pricing(pid);
  end if;

  perform public.sync_product_legacy_pricing_from_default(pid);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_product_pricing_sync_product_legacy_pricing on public.product_pricing;
create trigger trg_product_pricing_sync_product_legacy_pricing
  after insert or update or delete
  on public.product_pricing
  for each row
  execute function public.product_pricing_sync_product_legacy_pricing();

do $$
begin
  alter table public.contracts
    drop constraint if exists contracts_product_pricing_id_fkey;

  alter table public.contracts
    add constraint contracts_product_pricing_id_fkey
    foreign key (product_pricing_id) references public.product_pricing(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

alter table public.product_pricing enable row level security;

drop policy if exists "product_pricing_provider_own" on public.product_pricing;
create policy "product_pricing_provider_own"
  on public.product_pricing
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "product_pricing_select_published_dealer" on public.product_pricing;
create policy "product_pricing_select_published_dealer"
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
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','ADMIN','SUPER_ADMIN')
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

create table if not exists public.product_addons (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  description text,
  pricing_type text,
  applies_to_all_pricing_rows boolean not null default true,
  applicable_pricing_row_ids uuid[],
  base_price_cents integer not null,
  min_price_cents integer,
  max_price_cents integer,
  dealer_cost_cents integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

alter table public.product_addons
  add column if not exists applies_to_all_pricing_rows boolean not null default true;

alter table public.product_addons
  add column if not exists applicable_pricing_row_ids uuid[];

alter table public.product_addons enable row level security;

drop policy if exists "product_addons_provider_own" on public.product_addons;
create policy "product_addons_provider_own"
  on public.product_addons
  for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

drop policy if exists "product_addons_select_published_dealer" on public.product_addons;
create policy "product_addons_select_published_dealer"
  on public.product_addons
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products pr
      where pr.id = product_addons.product_id
        and pr.published = true
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','ADMIN','SUPER_ADMIN')
    )
  );

drop policy if exists "product_addons_select_admin_all" on public.product_addons;
create policy "product_addons_select_admin_all"
  on public.product_addons
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

drop policy if exists "product_documents_select_dealer" on public.product_documents;
create policy "product_documents_select_dealer"
  on public.product_documents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('DEALER','DEALER_ADMIN','DEALER_EMPLOYEE','ADMIN','SUPER_ADMIN')
    )
    and product_id is not null
    and exists (
      select 1
      from public.products pr
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
    insert into storage.buckets (id, name, public)
    values ('provider-logos', 'provider-logos', true)
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

  execute $sql$
    drop policy if exists "storage_product_documents_select_own_or_dealer" on storage.objects;
  $sql$;

  execute $sql$
    drop policy if exists "storage_provider_logos_select_public" on storage.objects;
    create policy "storage_provider_logos_select_public"
      on storage.objects
      for select
      to anon
      using (
        bucket_id = 'provider-logos'
      );
  $sql$;

  execute $sql$
    drop policy if exists "storage_provider_logos_select_authenticated" on storage.objects;
    create policy "storage_provider_logos_select_authenticated"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'provider-logos'
      );
  $sql$;

  execute $sql$
    drop policy if exists "storage_provider_logos_insert_own" on storage.objects;
    create policy "storage_provider_logos_insert_own"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'provider-logos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $sql$;

  execute $sql$
    drop policy if exists "storage_provider_logos_update_own" on storage.objects;
    create policy "storage_provider_logos_update_own"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'provider-logos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'provider-logos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $sql$;

  execute $sql$
    drop policy if exists "storage_provider_logos_delete_own" on storage.objects;
    create policy "storage_provider_logos_delete_own"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'provider-logos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $sql$;
exception
  when undefined_table then null;
end $$;

-- =============================================================================
-- Bridge Rebuild: new tables + helper functions (Phase 1 additive)
-- =============================================================================

-- Role enum
do $$ begin
  create type public.app_role as enum (
    'super_admin',
    'dealership_admin',
    'dealership_employee',
    'provider'
  );
exception when duplicate_object then null;
end $$;

-- user_roles — separate from profiles.role to prevent RLS recursion
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

drop policy if exists "Super admins can manage roles" on public.user_roles;
create policy "Super admins can manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'super_admin'));

-- Helper functions (security definer)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_dealership_member(_user_id uuid, _dealership_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.dealership_members
    where user_id = _user_id and dealership_id = _dealership_id
  )
$$;

create or replace function public.is_provider_member(_user_id uuid, _provider_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.provider_members
    where user_id = _user_id and provider_id = _provider_id
  )
$$;

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- dealerships
create table if not exists public.dealerships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  province text,
  license_number text,
  admin_code text not null default substr(md5(random()::text), 1, 8),
  compliance_info jsonb default '{}',
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'suspended')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  subscription_plan_key text,
  subscription_price_id text,
  subscription_trial_end timestamptz,
  subscription_current_period_end timestamptz,
  subscription_cancel_at_period_end boolean not null default false,
  subscription_seats_limit integer,
  contract_fee_cents integer,
  legacy_dealer_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dealerships enable row level security;

drop trigger if exists update_dealerships_updated_at on public.dealerships;
create trigger update_dealerships_updated_at
  before update on public.dealerships
  for each row execute function public.update_updated_at_column();

drop policy if exists "Members can view their dealership" on public.dealerships;
create policy "Members can view their dealership"
  on public.dealerships for select
  using (public.is_dealership_member(auth.uid(), id));

drop policy if exists "Super admins can view all dealerships" on public.dealerships;
create policy "Super admins can view all dealerships"
  on public.dealerships for select
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Super admins can manage dealerships" on public.dealerships;
create policy "Super admins can manage dealerships"
  on public.dealerships for all
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Authenticated can insert dealerships" on public.dealerships;
create policy "Authenticated can insert dealerships"
  on public.dealerships for insert
  with check (auth.uid() is not null);

drop policy if exists "Dealership admins can update their dealership" on public.dealerships;
create policy "Dealership admins can update their dealership"
  on public.dealerships for update
  using (
    exists (
      select 1 from public.dealership_members
      where user_id = auth.uid()
        and dealership_id = dealerships.id
        and role = 'admin'
    )
  );

-- dealership_members
create table if not exists public.dealership_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dealership_id uuid not null references public.dealerships(id) on delete cascade,
  role text not null default 'employee'
    check (role in ('admin', 'employee')),
  created_at timestamptz not null default now(),
  unique (user_id, dealership_id)
);
alter table public.dealership_members enable row level security;

drop policy if exists "Members can view their dealership members" on public.dealership_members;
create policy "Members can view their dealership members"
  on public.dealership_members for select
  using (public.is_dealership_member(auth.uid(), dealership_id));

drop policy if exists "Authenticated can insert dealership members" on public.dealership_members;
create policy "Authenticated can insert dealership members"
  on public.dealership_members for insert
  with check (auth.uid() is not null);

drop policy if exists "Super admins can manage dealership members" on public.dealership_members;
create policy "Super admins can manage dealership members"
  on public.dealership_members for all
  using (public.has_role(auth.uid(), 'super_admin'));

-- providers
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_email text,
  contact_phone text,
  address text,
  regions_served text[] default '{"Ontario"}',
  description text,
  logo_url text,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'suspended')),
  legacy_profile_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.providers enable row level security;

drop trigger if exists update_providers_updated_at on public.providers;
create trigger update_providers_updated_at
  before update on public.providers
  for each row execute function public.update_updated_at_column();

drop policy if exists "Public can view approved providers" on public.providers;
create policy "Public can view approved providers"
  on public.providers for select
  using (status = 'approved');

drop policy if exists "Provider members can view own" on public.providers;
create policy "Provider members can view own"
  on public.providers for select
  using (public.is_provider_member(auth.uid(), id));

drop policy if exists "Super admins can manage providers" on public.providers;
create policy "Super admins can manage providers"
  on public.providers for all
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "Authenticated can insert providers" on public.providers;
create policy "Authenticated can insert providers"
  on public.providers for insert
  with check (auth.uid() is not null);

drop policy if exists "Provider admins can update own" on public.providers;
create policy "Provider admins can update own"
  on public.providers for update
  using (
    exists (
      select 1 from public.provider_members
      where user_id = auth.uid()
        and provider_id = providers.id
        and role = 'admin'
    )
  );

-- provider_members
create table if not exists public.provider_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, provider_id)
);
alter table public.provider_members enable row level security;

drop policy if exists "Members can view provider members" on public.provider_members;
create policy "Members can view provider members"
  on public.provider_members for select
  using (public.is_provider_member(auth.uid(), provider_id));

drop policy if exists "Authenticated can insert provider members" on public.provider_members;
create policy "Authenticated can insert provider members"
  on public.provider_members for insert
  with check (auth.uid() is not null);

drop policy if exists "Super admins can manage provider members" on public.provider_members;
create policy "Super admins can manage provider members"
  on public.provider_members for all
  using (public.has_role(auth.uid(), 'super_admin'));

-- products — bridging columns (table already exists above)
alter table public.products
  add column if not exists provider_entity_id uuid references public.providers(id);

alter table public.products
  add column if not exists pricing_json jsonb default '{}';

alter table public.products
  add column if not exists eligibility_rules jsonb default '{}';

alter table public.products
  add column if not exists coverage_details_json jsonb default '{}';

drop trigger if exists update_products_updated_at on public.products;
create trigger update_products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at_column();

-- contracts — bridging columns (table already exists above)
alter table public.contracts
  add column if not exists dealership_id uuid references public.dealerships(id);

alter table public.contracts
  add column if not exists contract_price numeric(10,2);

alter table public.contracts
  add column if not exists dealer_cost_dollars numeric(10,2);

alter table public.contracts
  add column if not exists customer_first_name text;

alter table public.contracts
  add column if not exists customer_last_name text;

alter table public.contracts
  add column if not exists status_new text
    check (status_new in ('draft', 'submitted', 'active', 'cancelled', 'expired'));

alter table public.contracts
  add column if not exists provider_entity_id uuid references public.providers(id);

alter table public.contracts
  add column if not exists start_date date;

alter table public.contracts
  add column if not exists end_date date;

drop trigger if exists update_contracts_updated_at on public.contracts;
create trigger update_contracts_updated_at
  before update on public.contracts
  for each row execute function public.update_updated_at_column();

-- contract_remittances — new per-contract remittance model
create table if not exists public.contract_remittances (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  amount numeric(10,2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'overdue')),
  due_date date not null,
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contract_remittances enable row level security;

drop trigger if exists update_contract_remittances_updated_at on public.contract_remittances;
create trigger update_contract_remittances_updated_at
  before update on public.contract_remittances
  for each row execute function public.update_updated_at_column();

drop policy if exists "Contract parties can view remittances" on public.contract_remittances;
create policy "Contract parties can view remittances"
  on public.contract_remittances for select
  using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_id
      and (
        public.is_dealership_member(auth.uid(), c.dealership_id)
        or public.is_provider_member(auth.uid(), c.provider_entity_id)
      )
    )
  );

drop policy if exists "Dealership members can create remittances" on public.contract_remittances;
create policy "Dealership members can create remittances"
  on public.contract_remittances for insert
  with check (
    exists (
      select 1 from public.contracts c
      where c.id = contract_remittances.contract_id
      and public.is_dealership_member(auth.uid(), c.dealership_id)
    )
  );

drop policy if exists "Dealership members can update remittances" on public.contract_remittances;
create policy "Dealership members can update remittances"
  on public.contract_remittances for update
  using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_remittances.contract_id
      and public.is_dealership_member(auth.uid(), c.dealership_id)
    )
  );

drop policy if exists "Super admins can manage contract remittances" on public.contract_remittances;
create policy "Super admins can manage contract remittances"
  on public.contract_remittances for all
  using (public.has_role(auth.uid(), 'super_admin'));

-- dealership_product_pricing
create table if not exists public.dealership_product_pricing (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references public.dealerships(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  retail_price jsonb not null default '{}',
  confidentiality_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dealership_id, product_id)
);
alter table public.dealership_product_pricing enable row level security;

drop trigger if exists update_dealership_product_pricing_updated_at on public.dealership_product_pricing;
create trigger update_dealership_product_pricing_updated_at
  before update on public.dealership_product_pricing
  for each row execute function public.update_updated_at_column();

drop policy if exists "Dealership members can view pricing" on public.dealership_product_pricing;
create policy "Dealership members can view pricing"
  on public.dealership_product_pricing for select
  using (public.is_dealership_member(auth.uid(), dealership_id));

drop policy if exists "Dealership admins can insert pricing" on public.dealership_product_pricing;
create policy "Dealership admins can insert pricing"
  on public.dealership_product_pricing for insert
  with check (
    public.is_dealership_member(auth.uid(), dealership_id)
    and exists (
      select 1 from public.dealership_members
      where user_id = auth.uid()
        and dealership_id = dealership_product_pricing.dealership_id
        and role = 'admin'
    )
  );

drop policy if exists "Dealership admins can update pricing" on public.dealership_product_pricing;
create policy "Dealership admins can update pricing"
  on public.dealership_product_pricing for update
  using (
    public.is_dealership_member(auth.uid(), dealership_id)
    and exists (
      select 1 from public.dealership_members
      where user_id = auth.uid()
        and dealership_id = dealership_product_pricing.dealership_id
        and role = 'admin'
    )
  );

drop policy if exists "Super admins can manage pricing" on public.dealership_product_pricing;
create policy "Super admins can manage pricing"
  on public.dealership_product_pricing for all
  using (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- Migration 20260414120000: products V2 fixes, contracts V2 RLS, remittances
-- ============================================================================

-- Widen product_type CHECK constraint
do $$ begin
  alter table public.products drop constraint if exists products_product_type_check;
exception when undefined_object then null; end $$;

alter table public.products
  add constraint products_product_type_check
  check (product_type in (
    'EXTENDED_WARRANTY','GAP','TIRE_RIM','APPEARANCE','OTHER',
    'VSC','Tire & Rim','PPF','Ceramic Coating','Undercoating','Key Replacement','Dent Repair'
  ));

-- Products V2 RLS
drop policy if exists "products_provider_v2_own" on public.products;
create policy "products_provider_v2_own" on public.products for all to authenticated
  using  (public.is_provider_member(auth.uid(), provider_entity_id))
  with check (public.is_provider_member(auth.uid(), provider_entity_id));

drop policy if exists "products_super_admin" on public.products;
create policy "products_super_admin" on public.products for all to authenticated
  using  (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "products_select_published_any" on public.products;
create policy "products_select_published_any" on public.products for select to authenticated
  using (published = true);

-- Contracts V2 RLS
drop policy if exists "contracts_dealership_member_v2" on public.contracts;
create policy "contracts_dealership_member_v2" on public.contracts for all to authenticated
  using  (public.is_dealership_member(auth.uid(), dealership_id))
  with check (public.is_dealership_member(auth.uid(), dealership_id));

drop policy if exists "contracts_provider_member_v2" on public.contracts;
create policy "contracts_provider_member_v2" on public.contracts for select to authenticated
  using (public.is_provider_member(auth.uid(), provider_entity_id));

drop policy if exists "contracts_super_admin_v2" on public.contracts;
create policy "contracts_super_admin_v2" on public.contracts for all to authenticated
  using  (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- Remittances table + RLS
create table if not exists public.remittances (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  amount      numeric(10,2) not null,
  status      text not null default 'pending'
              check (status in ('pending','submitted','paid','overdue')),
  due_date    date not null,
  paid_date   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.remittances enable row level security;

drop policy if exists "remittances_dealership_view" on public.remittances;
create policy "remittances_dealership_view" on public.remittances for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_dealership_member(auth.uid(), c.dealership_id)));

drop policy if exists "remittances_dealership_insert" on public.remittances;
create policy "remittances_dealership_insert" on public.remittances for insert to authenticated
  with check (exists (select 1 from public.contracts c where c.id = contract_id and public.is_dealership_member(auth.uid(), c.dealership_id)));

drop policy if exists "remittances_provider_view" on public.remittances;
create policy "remittances_provider_view" on public.remittances for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and public.is_provider_member(auth.uid(), c.provider_entity_id)));

drop policy if exists "remittances_super_admin" on public.remittances;
create policy "remittances_super_admin" on public.remittances for all to authenticated
  using  (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));
