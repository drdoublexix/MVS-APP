-- Unified email/password auth profile provisioning.
-- Run this migration in the Supabase SQL Editor or through Supabase migrations.

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'client',
  add column if not exists phone_number text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists notification_preferences jsonb
    default '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb;

create unique index if not exists profiles_phone_number_unique
  on public.profiles (phone_number)
  where phone_number is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public."user_role";
  requested_phone text;
  requested_is_verified boolean;
begin
  requested_role := (case lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'))
    when 'vet' then 'vet'
    when 'veterinarian' then 'vet'
    when 'merchant' then 'merchant'
    else 'client'
  end)::public."user_role";

  requested_phone := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');
  requested_is_verified := new.email_confirmed_at is not null;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    phone_number,
    is_verified,
    notification_preferences
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    requested_role,
    requested_phone,
    requested_is_verified,
    '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
    role = case
      when public.profiles.role = 'client' and requested_role in ('vet', 'merchant') then requested_role
      else public.profiles.role
    end,
    is_verified = public.profiles.is_verified or excluded.is_verified;

  return new;
end;
$$;

create or replace function public.sync_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null then
    update public.profiles
    set is_verified = true
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row
when (new.email_confirmed_at is not null and (old.email_confirmed_at is null or old.email_confirmed_at is distinct from new.email_confirmed_at))
execute function public.sync_profile_verification();

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to authenticated, service_role;
revoke all on function public.sync_profile_verification() from public;
grant execute on function public.sync_profile_verification() to authenticated, service_role;

-- Optional verification queries:
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- select id, email, role, phone_number, is_verified from public.profiles order by created_at desc;
