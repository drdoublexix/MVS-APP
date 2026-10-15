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
         profiles.license_number::text, profiles.specialty, profiles.created_at,
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
