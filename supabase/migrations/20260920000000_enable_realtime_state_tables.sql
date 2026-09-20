-- Keep non-chat UI state synchronized through Supabase Realtime.
do $$
declare
  target_table text;
begin
  foreach target_table in array array['consultations', 'invoices', 'orders', 'profiles'] loop
    if not exists (
      select 1
      from pg_publication_rel publication_relation
      join pg_class relation on relation.oid = publication_relation.prrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_publication publication on publication.oid = publication_relation.prpubid
      where publication.pubname = 'supabase_realtime'
        and namespace.nspname = 'public'
        and relation.relname = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;