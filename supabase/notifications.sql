-- Store native and browser push delivery data for authenticated profile notifications.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS web_push_subscription TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"orders": true, "chat": true, "consultations": true, "reminders": true, "payouts": true}'::jsonb;

UPDATE public.profiles
SET notification_preferences = COALESCE(notification_preferences, '{"orders": true, "chat": true, "consultations": true, "reminders": true, "payouts": true}'::jsonb)
WHERE notification_preferences IS NULL;
