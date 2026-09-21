-- Store native and browser push delivery data for authenticated profile notifications.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON public.notifications (user_id, read_status, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

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
