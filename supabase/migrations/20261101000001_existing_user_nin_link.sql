alter table public.profiles
  add column if not exists nin_verified boolean not null default false;

alter table public.signup_nin_verifications
  add column if not exists purpose text not null default 'signup'
    check (purpose in ('signup', 'profile')),
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists signup_nin_verifications_user_purpose_idx
  on public.signup_nin_verifications (user_id, purpose, expires_at);

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
    and purpose = 'signup'
    and user_id is null
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
      full_name = concat_ws(' ', verified_record.first_name, nullif(verified_record.middle_name, ''), verified_record.last_name),
      nin_verified = true
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

create or replace function public.prevent_auth_identity_changes()
returns trigger
language plpgsql
set search_path = auth
as $$
begin
  if current_user <> 'postgres' and (
    old.raw_user_meta_data ->> 'full_name' is distinct from new.raw_user_meta_data ->> 'full_name'
    or old.raw_user_meta_data ->> 'first_name' is distinct from new.raw_user_meta_data ->> 'first_name'
    or old.raw_user_meta_data ->> 'middle_name' is distinct from new.raw_user_meta_data ->> 'middle_name'
    or old.raw_user_meta_data ->> 'last_name' is distinct from new.raw_user_meta_data ->> 'last_name'
    or old.raw_user_meta_data ->> 'nin' is distinct from new.raw_user_meta_data ->> 'nin'
    or old.raw_user_meta_data ->> 'nin_verified' is distinct from new.raw_user_meta_data ->> 'nin_verified'
  ) then
    raise exception 'Verified legal name cannot be changed.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.attach_verified_nin_to_profile(
  p_user_id uuid,
  p_verification_id uuid
)
returns table (first_name text, middle_name text, last_name text, full_name text, nin_suffix text)
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  verified_record public.signup_nin_verifications%rowtype;
  resolved_full_name text;
begin
  select *
    into verified_record
  from public.signup_nin_verifications
  where id = p_verification_id
    and user_id = p_user_id
    and purpose = 'profile'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'NIN verification has expired or is not valid for this account.'
      using errcode = '23514';
  end if;

  perform 1
  from public.profiles
  where id = p_user_id
    and not nin_verified
  for update;

  if not found then
    raise exception 'This account already has a verified NIN.'
      using errcode = '23514';
  end if;

  insert into private.user_nin (user_id, nin, consent_at)
  values (p_user_id, verified_record.nin, verified_record.consent_at);

  resolved_full_name := concat_ws(
    ' ',
    verified_record.first_name,
    nullif(verified_record.middle_name, ''),
    verified_record.last_name
  );

  update public.profiles
  set first_name = verified_record.first_name,
      middle_name = verified_record.middle_name,
      last_name = verified_record.last_name,
      full_name = resolved_full_name,
      nin_verified = true
  where id = p_user_id;

  update auth.users
  set raw_user_meta_data = (
    coalesce(raw_user_meta_data, '{}'::jsonb)
      - 'nin'
      - 'nin_verified'
      - 'nin_consent_at'
  ) || jsonb_build_object(
    'full_name', resolved_full_name,
    'first_name', verified_record.first_name,
    'middle_name', coalesce(verified_record.middle_name, ''),
    'last_name', verified_record.last_name
  )
  where id = p_user_id;

  delete from public.signup_nin_verifications
  where id = p_verification_id;

  return query select
    verified_record.first_name,
    verified_record.middle_name,
    verified_record.last_name,
    resolved_full_name,
    right(verified_record.nin, 4);
end;
$$;

revoke all on function public.attach_verified_nin_to_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_verified_nin_to_profile(uuid, uuid) to service_role;
