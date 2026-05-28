create or replace function public.can_select_dealer_team_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_members target_legacy
    join public.dealer_members viewer_legacy
      on viewer_legacy.dealer_id = target_legacy.dealer_id
    where target_legacy.user_id = target_user_id
      and viewer_legacy.user_id = auth.uid()
      and coalesce(target_legacy.status, 'ACTIVE') = 'ACTIVE'
      and coalesce(viewer_legacy.status, 'ACTIVE') = 'ACTIVE'
  )
  or exists (
    select 1
    from public.dealership_members target_dm
    join public.dealership_members viewer_dm
      on viewer_dm.dealership_id = target_dm.dealership_id
    where target_dm.user_id = target_user_id
      and viewer_dm.user_id = auth.uid()
      and viewer_dm.dealership_id = target_dm.dealership_id
  );
$$;
