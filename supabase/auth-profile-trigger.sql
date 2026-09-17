-- Repair the auth.users -> public.profiles signup path.
-- Run this in the Supabase SQL Editor as a project owner.

-- Before running the repair, these queries show the current remote trigger and
-- any required profile columns that can still abort an auth.users insert:
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
-- order by ordinal_position;
--
-- select t.typname, e.enumlabel
-- from pg_type t
-- join pg_enum e on e.enumtypid = t.oid
-- where t.typname = 'user_role'
-- order by e.enumsortorder;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'client',
  phone_number text
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'client',
  add column if not exists phone_number text;

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
begin
  requested_role := (case lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'))
    when 'vet' then 'vet'
    when 'veterinarian' then 'vet'
    when 'merchant' then 'merchant'
    else 'client'
  end)::public.user_role;

  requested_phone := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');

  insert into public.profiles (id, email, full_name, role, phone_number)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    requested_role,
    requested_phone
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = coalesce(excluded.role, public.profiles.role);

  return new;
exception
  when unique_violation then
    -- A duplicate phone must not make auth.users signup fail. The app checks
    -- this before signup and persists the phone after a successful session.
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      new.email,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
      requested_role
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

-- Remove every application trigger on auth.users. Keeping an older trigger
-- alongside this one would execute both functions and can still abort signup.
do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select tgname
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.tgname);
  end loop;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to authenticated, service_role;

-- Confirm that exactly one application trigger remains:
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- Required profile columns must either be supplied by the trigger or have a
-- default. This query exposes any remaining schema blocker:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'profiles'
--   and is_nullable = 'NO'
--   and column_default is null
-- order by ordinal_position;
