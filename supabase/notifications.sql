-- Store the Expo push token for authenticated profile notifications.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
