-- Ensure the project owner account has all-access super admin privileges in
-- both the legacy role column and the V2 user_roles table.
do $$
declare
  v_user_id uuid;
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

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'super_admin'::public.app_role)
  on conflict (user_id, role) do nothing;
end $$;
