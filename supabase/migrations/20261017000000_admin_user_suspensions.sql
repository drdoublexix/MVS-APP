alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists ban_reason text;

create or replace function public.prevent_self_managed_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin()
    and (
      new.is_banned is distinct from old.is_banned
      or new.banned_at is distinct from old.banned_at
      or new.ban_reason is distinct from old.ban_reason
    )
  then
    raise exception 'Only a super administrator can change account suspension status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_managed_suspension on public.profiles;
create trigger prevent_self_managed_suspension
  before update on public.profiles
  for each row execute function public.prevent_self_managed_suspension();

create or replace function public.admin_list_user_accounts(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  is_banned boolean,
  banned_at timestamptz,
  ban_reason text
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
  select profiles.id, profiles.email, profiles.full_name, profiles.role::text,
         profiles.is_banned, profiles.banned_at, profiles.ban_reason
  from public.profiles as profiles
  where profiles.email is not null
    and profiles.deleted_at is null
    and profiles.id <> (select auth.uid())
    and (
      p_search is null
      or profiles.email ilike '%' || p_search || '%'
      or profiles.full_name ilike '%' || p_search || '%'
    )
  order by lower(profiles.email)
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_user_ban(
  p_user_id uuid,
  p_is_banned boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_user_id is null or p_is_banned is null then
    raise exception 'A user and suspension action are required.';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot suspend your own administrator account.';
  end if;
  if exists (
    select 1 from public.admin_users
    where id = p_user_id and is_super_admin = true
  ) then
    raise exception 'A super administrator account cannot be suspended here.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and deleted_at is null
  ) then
    raise exception 'The active user account could not be found.';
  end if;
  if p_is_banned and clean_reason is null then
    raise exception 'Enter a reason for suspending this account.';
  end if;

  update public.profiles
  set is_banned = p_is_banned,
      banned_at = case when p_is_banned then transaction_timestamp() else null end,
      ban_reason = case when p_is_banned then clean_reason else null end
  where id = p_user_id;

  update auth.users
  set banned_until = case
    when p_is_banned then transaction_timestamp() + interval '100 years'
    else null
  end
  where id = p_user_id;
  if not found then
    raise exception 'The authentication account could not be found.';
  end if;
  if p_is_banned then
    delete from auth.sessions where user_id = p_user_id;
  end if;

  insert into public.activity_logs (user_id, action, resource_type, resource_id, details, status)
  values (
    (select auth.uid()),
    case when p_is_banned then 'user_banned' else 'user_unbanned' end,
    'user',
    p_user_id,
    jsonb_build_object('reason', case when p_is_banned then clean_reason else null end),
    'success'
  );
end;
$$;

revoke all on function public.admin_list_user_accounts(text, integer, integer) from public, anon;
revoke all on function public.admin_set_user_ban(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_user_accounts(text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_set_user_ban(uuid, boolean, text) to authenticated, service_role;
