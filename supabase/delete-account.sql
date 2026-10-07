-- Run this in Supabase SQL Editor only if migrations are not being used.
-- Deactivation preserves account and related data for later review.
alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'When the account was deactivated by its owner. Account and related data are retained for review.';

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleting_user_id uuid := auth.uid();
begin
  if deleting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set deleted_at = coalesce(deleted_at, transaction_timestamp())
  where id = deleting_user_id;

  if not found then
    raise exception 'Account profile not found';
  end if;

  update auth.users
  set banned_until = greatest(
    coalesce(banned_until, '-infinity'::timestamptz),
    transaction_timestamp() + interval '100 years'
  )
  where id = deleting_user_id;

  if not found then
    raise exception 'Authentication account not found';
  end if;
end;
$$;

revoke all on function public.delete_user_account() from public, anon, authenticated;
grant execute on function public.delete_user_account() to authenticated;
