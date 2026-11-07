-- A phone number may be shared by multiple role accounts belonging to one person.
drop index if exists public.profiles_phone_number_unique;
