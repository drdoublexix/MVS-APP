-- Preserve an existing profile role during auth re-sync.
-- New profiles still derive their role from auth.users.raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public."user_role";
  requested_phone text;
  requested_specialty text;
  requested_loyalty_points integer;
  requested_is_verified boolean;
begin
  requested_role := (case lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'))
    when 'vet' then 'vet'
    when 'veterinarian' then 'vet'
    when 'merchant' then 'merchant'
    else 'client'
  end)::public.user_role;

  requested_phone := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');
  requested_specialty := case
    when requested_role = 'vet' then nullif(new.raw_user_meta_data ->> 'specialty', '')
    else null
  end;
  requested_loyalty_points := case
    when requested_role = 'client' then 0
    else null
  end;
  requested_is_verified := new.email_confirmed_at is not null;

  insert into public.profiles (
    id, email, full_name, role, phone_number, specialty, loyalty_points,
    is_verified, notification_preferences
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    requested_role,
    requested_phone,
    requested_specialty,
    requested_loyalty_points,
    requested_is_verified,
    '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    -- Existing roles are authoritative and must never be downgraded to client.
    role = public.profiles.role,
    specialty = case when public.profiles.role = 'vet' then excluded.specialty else null end,
    loyalty_points = case when public.profiles.role = 'client' then coalesce(excluded.loyalty_points, public.profiles.loyalty_points, 0) else null end,
    is_verified = public.profiles.is_verified or excluded.is_verified;

  return new;
exception
  when unique_violation then
    insert into public.profiles (
      id, email, full_name, role, specialty, loyalty_points,
      is_verified, notification_preferences
    )
    values (
      new.id,
      new.email,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
      requested_role,
      requested_specialty,
      requested_loyalty_points,
      requested_is_verified,
      '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
    )
    on conflict (id) do nothing;
    return new;
end;
$$;
