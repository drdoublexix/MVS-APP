alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.user_nin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nin text not null unique check (nin ~ '^[0-9]{11}$'),
  consent_at timestamptz not null
);

alter table private.user_nin enable row level security;
revoke all on table private.user_nin from public, anon, authenticated, service_role;

create or replace function private.prevent_user_nin_updates()
returns trigger
language plpgsql
set search_path = private
as $$
begin
  raise exception 'A stored NIN cannot be changed.'
    using errcode = '42501';
end;
$$;

drop trigger if exists prevent_user_nin_updates on private.user_nin;
create trigger prevent_user_nin_updates
before update on private.user_nin
for each row execute function private.prevent_user_nin_updates();

create table if not exists public.signup_nin_verifications (
  id uuid primary key default gen_random_uuid(),
  nin text not null check (nin ~ '^[0-9]{11}$'),
  first_name text not null,
  middle_name text,
  last_name text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.signup_nin_verifications enable row level security;
revoke all on table public.signup_nin_verifications from anon, authenticated;
grant all on table public.signup_nin_verifications to service_role;

create table if not exists public.signup_nin_lookup_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.signup_nin_lookup_rate_limits enable row level security;
revoke all on table public.signup_nin_lookup_rate_limits from anon, authenticated;
grant all on table public.signup_nin_lookup_rate_limits to service_role;

create or replace function public.consume_nin_lookup_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  delete from public.signup_nin_lookup_rate_limits
  where window_started_at < now() - interval '1 day';

  insert into public.signup_nin_lookup_rate_limits (ip_hash, window_started_at, request_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set window_started_at = case
        when public.signup_nin_lookup_rate_limits.window_started_at <= now() - interval '15 minutes' then now()
        else public.signup_nin_lookup_rate_limits.window_started_at
      end,
      request_count = case
        when public.signup_nin_lookup_rate_limits.window_started_at <= now() - interval '15 minutes' then 1
        else public.signup_nin_lookup_rate_limits.request_count + 1
      end
  returning request_count <= 5 into allowed;

  return allowed;
end;
$$;

revoke all on function public.consume_nin_lookup_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_nin_lookup_rate_limit(text) to service_role;

create or replace function public.require_verified_nin_for_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  verification_id uuid;
  verified_nin text;
  verified_first_name text;
  verified_middle_name text;
  verified_last_name text;
begin
  if coalesce(new.raw_user_meta_data ->> 'nin_verification_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'A valid NIN verification is required to create an account.'
      using errcode = '23514';
  end if;

  verification_id := (new.raw_user_meta_data ->> 'nin_verification_id')::uuid;
  select nin, first_name, middle_name, last_name
    into verified_nin, verified_first_name, verified_middle_name, verified_last_name
  from public.signup_nin_verifications
  where id = verification_id
    and expires_at > now()
  for update;

  if not found then
    raise exception 'NIN verification has expired or has already been used.'
      using errcode = '23514';
  end if;

  new.raw_user_meta_data := (coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'nin' - 'nin_consent_at' - 'nin_verified') || jsonb_build_object(
    'full_name', concat_ws(' ', verified_first_name, nullif(verified_middle_name, ''), verified_last_name),
    'first_name', verified_first_name,
    'middle_name', coalesce(verified_middle_name, ''),
    'last_name', verified_last_name
  );
  return new;
end;
$$;

create or replace function public.sync_verified_nin_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  verification_id uuid;
  verified_record public.signup_nin_verifications%rowtype;
begin
  verification_id := (new.raw_user_meta_data ->> 'nin_verification_id')::uuid;

  select *
    into verified_record
  from public.signup_nin_verifications
  where id = verification_id
    and expires_at > now()
  for update;

  if not found then
    raise exception 'NIN verification has expired or has already been used.'
      using errcode = '23514';
  end if;

  update public.profiles
  set first_name = verified_record.first_name,
      middle_name = verified_record.middle_name,
      last_name = verified_record.last_name,
      full_name = concat_ws(' ', verified_record.first_name, nullif(verified_record.middle_name, ''), verified_record.last_name)
  where id = new.id;

  if not found then
    raise exception 'The account profile could not be created for the verified identity.'
      using errcode = '23503';
  end if;

  insert into private.user_nin (user_id, nin, consent_at)
  values (new.id, verified_record.nin, verified_record.consent_at);

  delete from public.signup_nin_verifications where id = verification_id;
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'nin_verification_id'
  where id = new.id;

  return new;
end;
$$;

create or replace function public.prevent_profile_identity_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres' and (
    old.first_name is distinct from new.first_name
    or old.middle_name is distinct from new.middle_name
    or old.last_name is distinct from new.last_name
    or old.full_name is distinct from new.full_name
  ) then
    raise exception 'Verified legal name cannot be changed.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_auth_identity_changes()
returns trigger
language plpgsql
set search_path = auth
as $$
begin
  if old.raw_user_meta_data ->> 'full_name' is distinct from new.raw_user_meta_data ->> 'full_name'
    or old.raw_user_meta_data ->> 'first_name' is distinct from new.raw_user_meta_data ->> 'first_name'
    or old.raw_user_meta_data ->> 'middle_name' is distinct from new.raw_user_meta_data ->> 'middle_name'
    or old.raw_user_meta_data ->> 'last_name' is distinct from new.raw_user_meta_data ->> 'last_name'
    or old.raw_user_meta_data ->> 'nin' is distinct from new.raw_user_meta_data ->> 'nin'
    or old.raw_user_meta_data ->> 'nin_verified' is distinct from new.raw_user_meta_data ->> 'nin_verified'
  then
    raise exception 'Verified legal name cannot be changed.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists require_verified_nin_for_signup on auth.users;
create trigger require_verified_nin_for_signup
before insert on auth.users
for each row execute function public.require_verified_nin_for_signup();

drop trigger if exists sync_verified_nin_to_profile on auth.users;
create trigger sync_verified_nin_to_profile
after insert on auth.users
for each row execute function public.sync_verified_nin_to_profile();

drop trigger if exists prevent_auth_identity_changes on auth.users;
create trigger prevent_auth_identity_changes
before update of raw_user_meta_data on auth.users
for each row execute function public.prevent_auth_identity_changes();

drop trigger if exists prevent_profile_identity_changes on public.profiles;
create trigger prevent_profile_identity_changes
before update on public.profiles
for each row execute function public.prevent_profile_identity_changes();

revoke all on function public.require_verified_nin_for_signup() from public;
revoke all on function public.sync_verified_nin_to_profile() from public;
revoke all on function public.prevent_profile_identity_changes() from public;
revoke all on function public.prevent_auth_identity_changes() from public;
revoke all on function private.prevent_user_nin_updates() from public, anon, authenticated, service_role;
