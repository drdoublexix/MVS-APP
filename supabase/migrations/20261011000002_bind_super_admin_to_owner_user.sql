-- Bind dashboard authority to the existing, email-confirmed owner account ID.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = (SELECT auth.uid())
      AND lower(email) = 'emmykul89@gmail.com'
      AND is_super_admin = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

INSERT INTO public.admin_users (id, email, role, is_super_admin, permissions)
SELECT id, email, 'super_admin', true, '["activity_logs", "send_email"]'::jsonb
FROM auth.users
WHERE lower(email) = 'emmykul89@gmail.com'
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = 'super_admin',
  is_super_admin = true,
  permissions = EXCLUDED.permissions,
  updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE lower(email) = 'emmykul89@gmail.com' AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Cannot enable the dashboard: the email-confirmed owner account emmykul89@gmail.com was not found.';
  END IF;
END;
$$;
