CREATE OR REPLACE FUNCTION public.get_super_admin_user_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total_users bigint;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO total_users
  FROM public.profiles;

  RETURN total_users;
END;
$$;

REVOKE ALL ON FUNCTION public.get_super_admin_user_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_admin_user_count() TO authenticated, service_role;
