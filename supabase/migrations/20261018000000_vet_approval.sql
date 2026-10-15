alter table public.profiles
  add column if not exists is_vet_approved boolean not null default false;

update public.profiles
set is_vet_approved = true
where role = 'vet'
  and is_vet_approved = false;

create or replace function public.prevent_self_managed_vet_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_vet_approved is distinct from old.is_vet_approved
    and auth.uid() is not null
    and not public.is_super_admin()
  then
    raise exception 'Only a super administrator can change veterinarian approval status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_managed_vet_approval on public.profiles;
create trigger prevent_self_managed_vet_approval
  before update on public.profiles
  for each row execute function public.prevent_self_managed_vet_approval();

create or replace function public.admin_list_vet_applications(
  p_search text default null,
  p_is_approved boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone_number text,
  license_number text,
  specialty text,
  created_at timestamptz,
  is_vet_approved boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select profiles.id, profiles.email, profiles.full_name, profiles.phone_number,
         profiles.license_number, profiles.specialty, profiles.created_at,
         profiles.is_vet_approved
  from public.profiles as profiles
  where profiles.role = 'vet'
    and profiles.deleted_at is null
    and profiles.is_vet_approved = coalesce(p_is_approved, false)
    and (
      p_search is null
      or profiles.email ilike '%' || p_search || '%'
      or profiles.full_name ilike '%' || p_search || '%'
      or profiles.license_number ilike '%' || p_search || '%'
    )
  order by profiles.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_vet_approval(
  p_vet_id uuid,
  p_is_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vet_email text;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_vet_id is null or p_is_approved is null then
    raise exception 'A veterinarian and approval decision are required.';
  end if;
  if p_vet_id = (select auth.uid()) then
    raise exception 'You cannot change your own veterinarian approval status.';
  end if;

  update public.profiles
  set is_vet_approved = p_is_approved
  where id = p_vet_id
    and role = 'vet'
    and deleted_at is null
  returning email into vet_email;

  if not found then
    raise exception 'The active veterinarian account could not be found.';
  end if;

  insert into public.activity_logs (user_id, action, resource_type, resource_id, details, status)
  values (
    (select auth.uid()),
    case when p_is_approved then 'vet_approved' else 'vet_unapproved' end,
    'vet',
    p_vet_id,
    jsonb_build_object('email', vet_email),
    'success'
  );
end;
$$;

revoke all on function public.admin_list_vet_applications(text, boolean, integer, integer) from public, anon;
revoke all on function public.admin_set_vet_approval(uuid, boolean) from public, anon;
grant execute on function public.admin_list_vet_applications(text, boolean, integer, integer) to authenticated, service_role;
grant execute on function public.admin_set_vet_approval(uuid, boolean) to authenticated, service_role;
