alter table public.profiles
  add column if not exists license_number text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public."user_role";
  requested_phone text;
  requested_license_number text;
  requested_is_verified boolean;
begin
  requested_role := (case lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'))
    when 'vet' then 'vet'
    when 'veterinarian' then 'vet'
    when 'merchant' then 'merchant'
    else 'client'
  end)::public."user_role";

  requested_phone := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');
  requested_license_number := case
    when requested_role = 'vet' then nullif(trim(new.raw_user_meta_data ->> 'license_number'), '')
    else null
  end;
  requested_is_verified := new.email_confirmed_at is not null;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    phone_number,
    license_number,
    is_verified,
    notification_preferences
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    requested_role,
    requested_phone,
    requested_license_number,
    requested_is_verified,
    '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
    license_number = coalesce(excluded.license_number, public.profiles.license_number),
    role = case
      when public.profiles.role = 'client' and requested_role in ('vet', 'merchant') then requested_role
      else public.profiles.role
    end,
    is_verified = public.profiles.is_verified or excluded.is_verified;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to authenticated, service_role;
