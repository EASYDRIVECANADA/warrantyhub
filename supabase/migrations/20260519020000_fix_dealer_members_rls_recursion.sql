create or replace function public.is_active_dealer_admin_member(target_dealer_id uuid)
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
      and dm.role = 'DEALER_ADMIN'
  );
$$;

create or replace function public.can_select_dealer_team_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_members dm_target
    where dm_target.user_id = target_user_id
      and public.is_active_dealer_admin_member(dm_target.dealer_id)
  );
$$;

drop policy if exists "profiles_select_dealer_admin_team" on public.profiles;
create policy "profiles_select_dealer_admin_team"
  on public.profiles
  for select
  to authenticated
  using (public.can_select_dealer_team_profile(profiles.id));

drop policy if exists "dealer_members_dealer_admin_select_team" on public.dealer_members;
create policy "dealer_members_dealer_admin_select_team"
  on public.dealer_members
  for select
  to authenticated
  using (public.is_active_dealer_admin_member(dealer_members.dealer_id));
