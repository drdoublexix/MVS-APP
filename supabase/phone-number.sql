-- Store one normalized international phone number per profile.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Phone numbers can be shared across the same person's role accounts.
DROP INDEX IF EXISTS public.profiles_phone_number_unique;