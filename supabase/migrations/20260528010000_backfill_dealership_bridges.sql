-- Ensure legacy dealer-team memberships are visible in the V2 dealership portal.
insert into public.dealerships (name, status, legacy_dealer_id)
select
  coalesce(nullif(trim(d.name), ''), 'Dealership') as name,
  'approved' as status,
  d.id as legacy_dealer_id
from public.dealers d
where not exists (
  select 1
  from public.dealerships ds
  where ds.legacy_dealer_id = d.id
)
on conflict (legacy_dealer_id) do update
set
  name = excluded.name,
  status = 'approved',
  updated_at = now();

insert into public.dealership_members (dealership_id, user_id, role, created_at)
select
  ds.id as dealership_id,
  dm.user_id,
  case when dm.role = 'DEALER_ADMIN' then 'admin' else 'employee' end as role,
  coalesce(dm.created_at, now()) as created_at
from public.dealer_members dm
join public.dealerships ds on ds.legacy_dealer_id = dm.dealer_id
where dm.user_id is not null
  and coalesce(dm.status, 'ACTIVE') <> 'DISABLED'
on conflict (user_id, dealership_id) do update
set role = excluded.role;

insert into public.user_roles (user_id, role)
select distinct
  dm.user_id,
  case
    when dm.role = 'DEALER_ADMIN' then 'dealership_admin'::public.app_role
    else 'dealership_employee'::public.app_role
  end as role
from public.dealer_members dm
where dm.user_id is not null
  and coalesce(dm.status, 'ACTIVE') <> 'DISABLED'
on conflict (user_id, role) do nothing;

with effective_dealer_roles as (
  select
    dm.user_id,
    bool_or(dm.role = 'DEALER_ADMIN') as has_admin_membership
  from public.dealer_members dm
  where dm.user_id is not null
    and coalesce(dm.status, 'ACTIVE') <> 'DISABLED'
  group by dm.user_id
)
delete from public.user_roles ur
using effective_dealer_roles edr
where ur.user_id = edr.user_id
  and (
    (edr.has_admin_membership and ur.role = 'dealership_employee'::public.app_role)
    or (not edr.has_admin_membership and ur.role = 'dealership_admin'::public.app_role)
  );
