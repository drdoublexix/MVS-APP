-- Store native and browser push delivery data for authenticated profile notifications.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS web_push_subscription TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb;

ALTER TABLE public.profiles
  ALTER COLUMN notification_preferences SET DEFAULT '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb;

UPDATE public.profiles
SET notification_preferences = '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
WHERE notification_preferences IS NULL;
