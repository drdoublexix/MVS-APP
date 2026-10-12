alter table public.profiles
  add column if not exists preferred_language text not null default 'en'
  check (preferred_language in ('en', 'ha', 'yo', 'ig'));

create or replace function public.sync_profile_language_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_language text;
begin
  requested_language := case lower(coalesce(new.raw_user_meta_data ->> 'preferred_language', 'en'))
    when 'ha' then 'ha'
    when 'yo' then 'yo'
    when 'ig' then 'ig'
    else 'en'
  end;

  update public.profiles
  set preferred_language = requested_language
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists zzz_sync_profile_language_from_auth on auth.users;
create trigger zzz_sync_profile_language_from_auth
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_language_from_auth();

revoke all on function public.sync_profile_language_from_auth() from public, anon, authenticated;
grant execute on function public.sync_profile_language_from_auth() to service_role;
