-- Ensure the project owner account has all-access super admin privileges and
-- is also the EasyDrive Canada dealership admin in legacy and V2 tables.
do $$
declare
  v_user_id uuid;
  v_legacy_dealer_id uuid;
  v_dealership_id uuid;
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = 'info@easydrivecanada.com'
  order by created_at
  limit 1;

  if v_user_id is null then
    raise notice 'info@easydrivecanada.com auth user does not exist yet; create the user, then rerun this migration or SQL block.';
    return;
  end if;

  insert into public.profiles (id, email, role, is_active)
  values (v_user_id, 'info@easydrivecanada.com', 'SUPER_ADMIN', true)
  on conflict (id) do update
    set email = excluded.email,
        role = 'SUPER_ADMIN',
        is_active = true;

  select id
    into v_legacy_dealer_id
  from public.dealers
  where name ilike '%easy%drive%canada%'
     or name ilike '%easy drive canada%'
  order by created_at
  limit 1;

  if v_legacy_dealer_id is null then
    insert into public.dealers (name, markup_pct)
    values ('EasyDrive Canada', 0)
    returning id into v_legacy_dealer_id;
  end if;

  select id
    into v_dealership_id
  from public.dealerships
  where legacy_dealer_id = v_legacy_dealer_id
     or name ilike '%easy%drive%canada%'
     or name ilike '%easy drive canada%'
  order by created_at
  limit 1;

  if v_dealership_id is null then
    insert into public.dealerships (name, status, legacy_dealer_id)
    values ('EasyDrive Canada', 'approved', v_legacy_dealer_id)
    returning id into v_dealership_id;
  else
    update public.dealerships
      set legacy_dealer_id = coalesce(legacy_dealer_id, v_legacy_dealer_id),
          status = 'approved'
    where id = v_dealership_id;
  end if;

  insert into public.user_roles (user_id, role)
  values
    (v_user_id, 'super_admin'::public.app_role),
    (v_user_id, 'dealership_admin'::public.app_role)
  on conflict (user_id, role) do nothing;

  insert into public.dealer_members (dealer_id, user_id, role, status)
  values (v_legacy_dealer_id, v_user_id, 'DEALER_ADMIN', 'ACTIVE')
  on conflict (dealer_id, user_id) do update
    set role = 'DEALER_ADMIN',
        status = 'ACTIVE';

  insert into public.dealership_members (dealership_id, user_id, role)
  values (v_dealership_id, v_user_id, 'admin')
  on conflict (user_id, dealership_id) do update
    set role = 'admin';
end $$;
