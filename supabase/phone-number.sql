-- Store one normalized international phone number per profile.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique
ON public.profiles (phone_number)
WHERE phone_number IS NOT NULL;