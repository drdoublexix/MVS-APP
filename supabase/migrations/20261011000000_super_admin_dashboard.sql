-- Super Admin Dashboard Tables
-- Run this migration in Supabase

-- Super Admin Users Table
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view all admins" ON public.admin_users;
CREATE POLICY "Super admins can view all admins"
  ON public.admin_users FOR SELECT TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com');

DROP POLICY IF EXISTS "Super admins can manage admins" ON public.admin_users;
CREATE POLICY "Super admins can manage admins"
  ON public.admin_users FOR ALL TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com')
  WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com');

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_user_id_created_at_idx
  ON public.activity_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_action_created_at_idx
  ON public.activity_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view all activity logs" ON public.activity_logs;
CREATE POLICY "Super admins can view all activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com');

-- Admin Email Templates Table
CREATE TABLE IF NOT EXISTS public.admin_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage email templates" ON public.admin_email_templates;
CREATE POLICY "Super admins can manage email templates"
  ON public.admin_email_templates FOR ALL TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com')
  WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com');

-- Admin Email Logs Table
CREATE TABLE IF NOT EXISTS public.admin_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id),
  template_id UUID REFERENCES public.admin_email_templates(id),
  subject TEXT NOT NULL,
  html_content TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_email_logs_sent_by_idx
  ON public.admin_email_logs (sent_by, sent_at DESC);

CREATE INDEX IF NOT EXISTS admin_email_logs_sent_at_idx
  ON public.admin_email_logs (sent_at DESC);

ALTER TABLE public.admin_email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view email logs" ON public.admin_email_logs;
CREATE POLICY "Super admins can view email logs"
  ON public.admin_email_logs FOR SELECT TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com');

-- Grant permissions
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
GRANT SELECT ON public.admin_email_templates TO authenticated;
GRANT ALL ON public.admin_email_templates TO service_role;
GRANT SELECT ON public.admin_email_logs TO authenticated;
GRANT ALL ON public.admin_email_logs TO service_role;
