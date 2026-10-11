-- Extend the row-level audit trail to the remaining user-facing activity tables.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'investor_submissions',
    'loyalty_logs',
    'mvsai_chat_messages',
    'notifications',
    'petowner_farmer_submissions',
    'prescriptions',
    'vet_ratings',
    'vet_submissions'
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
