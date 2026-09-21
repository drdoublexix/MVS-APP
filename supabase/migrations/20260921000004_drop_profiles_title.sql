-- Veterinarian prefixes are managed in profiles.full_name.
-- The title column is intentionally removed from public.profiles.
alter table if exists public.profiles
drop column if exists title cascade;
