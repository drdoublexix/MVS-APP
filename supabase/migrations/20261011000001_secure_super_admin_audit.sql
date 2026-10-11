-- Restrict the dashboard to the verified owner account and expose audit data
-- only through owner-checked policies and RPCs.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'emmykul89@gmail.com';
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

DROP POLICY IF EXISTS "Super admins can view all admins" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins can manage admins" ON public.admin_users;
REVOKE ALL ON public.admin_users FROM anon, authenticated;

ALTER TABLE public.activity_logs
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Super admins can view all activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can record their own authentication activity" ON public.activity_logs;
CREATE POLICY "Super admins can view all activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "Users can record their own authentication activity"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND action IN ('user_login', 'user_logout')
  );
REVOKE ALL ON public.activity_logs FROM anon;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

DROP POLICY IF EXISTS "Super admins can manage email templates" ON public.admin_email_templates;
CREATE POLICY "Super admins can manage email templates"
  ON public.admin_email_templates FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
REVOKE ALL ON public.admin_email_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_email_templates TO authenticated;
GRANT ALL ON public.admin_email_templates TO service_role;

DROP POLICY IF EXISTS "Super admins can view email logs" ON public.admin_email_logs;
CREATE POLICY "Super admins can view email logs"
  ON public.admin_email_logs FOR SELECT TO authenticated
  USING (public.is_super_admin());
REVOKE ALL ON public.admin_email_logs FROM anon, authenticated;
GRANT SELECT ON public.admin_email_logs TO authenticated;
GRANT ALL ON public.admin_email_logs TO service_role;

CREATE OR REPLACE FUNCTION public.record_activity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  source_row jsonb;
  changed_columns text[];
  actor_id uuid;
  record_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW);
    source_row := new_row;
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    source_row := new_row;
    SELECT coalesce(array_agg(new_entry.key ORDER BY new_entry.key), ARRAY[]::text[])
      INTO changed_columns
      FROM jsonb_each(new_row) AS new_entry
      JOIN jsonb_each(old_row) AS old_entry USING (key)
      WHERE new_entry.value IS DISTINCT FROM old_entry.value;
  ELSE
    old_row := to_jsonb(OLD);
    source_row := old_row;
  END IF;

  actor_id := coalesce(
    auth.uid(),
    nullif(source_row ->> 'user_id', '')::uuid,
    nullif(source_row ->> 'owner_id', '')::uuid,
    nullif(source_row ->> 'client_id', '')::uuid,
    nullif(source_row ->> 'buyer_id', '')::uuid,
    nullif(source_row ->> 'seller_id', '')::uuid,
    nullif(source_row ->> 'sender_id', '')::uuid,
    nullif(source_row ->> 'vet_id', '')::uuid,
    CASE WHEN TG_TABLE_NAME = 'profiles' THEN nullif(source_row ->> 'id', '')::uuid END
  );
  record_id := nullif(source_row ->> 'id', '')::uuid;

  INSERT INTO public.activity_logs (user_id, action, resource_type, resource_id, details, status)
  VALUES (
    actor_id,
    lower(TG_OP),
    TG_TABLE_NAME,
    record_id,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'changed_columns', coalesce(to_jsonb(changed_columns), '[]'::jsonb)
    ),
    'success'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_activity_change() TO service_role;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles',
    'pets',
    'farm_records',
    'farm_medical_records',
    'farm_soap_records',
    'pet_medical_records',
    'pet_soap_records',
    'orders',
    'consultations',
    'messages',
    'community_messages',
    'invoices',
    'products'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_activity_change ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER audit_activity_change
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.record_activity_change()',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_activity_logs(
  p_email text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  action text,
  resource_type text,
  resource_id uuid,
  details jsonb,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT logs.id, logs.user_id, profiles.email, profiles.role::text,
         logs.action, logs.resource_type, logs.resource_id, logs.details,
         logs.status, logs.created_at
  FROM public.activity_logs AS logs
  LEFT JOIN public.profiles AS profiles ON profiles.id = logs.user_id
  WHERE (p_email IS NULL OR profiles.email ILIKE '%' || p_email || '%')
    AND (p_role IS NULL OR profiles.role::text = p_role)
    AND (p_action IS NULL OR logs.action = p_action)
    AND (p_since IS NULL OR logs.created_at >= p_since)
    AND (p_until IS NULL OR logs.created_at < p_until)
  ORDER BY logs.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_super_admin_recipients(
  p_search text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT profiles.id, profiles.email, profiles.full_name, profiles.role::text
  FROM public.profiles AS profiles
  WHERE profiles.email IS NOT NULL
    AND (p_search IS NULL OR profiles.email ILIKE '%' || p_search || '%'
         OR profiles.full_name ILIKE '%' || p_search || '%')
    AND (p_role IS NULL OR profiles.role::text = p_role)
  ORDER BY profiles.email
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_super_admin_activity_logs(text, text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_super_admin_recipients(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_activity_logs(text, text, text, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_super_admin_recipients(text, text, integer, integer) TO authenticated, service_role;
