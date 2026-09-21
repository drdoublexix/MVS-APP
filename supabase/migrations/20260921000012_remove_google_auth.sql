-- Remove Google OAuth-specific role synchronization from deployed databases.
-- Manual email/password auth and its profile trigger remain enabled.

drop trigger if exists on_auth_user_role_metadata_updated on auth.users;
drop function if exists public.sync_profile_role_from_metadata();
drop function if exists public.assign_signup_role(uuid, text);