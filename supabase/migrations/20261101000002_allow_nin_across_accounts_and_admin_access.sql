alter table private.user_nin
  drop constraint if exists user_nin_nin_key;

create or replace function public.admin_get_user_nin(p_user_id uuid)
returns table (nin text, consent_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_nin text;
  stored_consent_at timestamptz;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and deleted_at is null
  ) then
    raise exception 'The active user account could not be found.';
  end if;

  select user_nin.nin, user_nin.consent_at
    into stored_nin, stored_consent_at
  from private.user_nin as user_nin
  where user_nin.user_id = p_user_id;

  insert into public.activity_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    status
  )
  values (
    (select auth.uid()),
    'admin_viewed_user_nin',
    'user_nin',
    p_user_id,
    jsonb_build_object('has_nin', stored_nin is not null),
    'success'
  );

  return query select stored_nin, stored_consent_at;
end;
$$;

revoke all on function public.admin_get_user_nin(uuid) from public, anon;
grant execute on function public.admin_get_user_nin(uuid) to authenticated, service_role;
