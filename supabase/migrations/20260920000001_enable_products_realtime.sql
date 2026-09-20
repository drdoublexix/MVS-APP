-- Keep merchant inventory metrics synchronized when products change.
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel publication_relation
    join pg_class relation on relation.oid = publication_relation.prrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_publication publication on publication.oid = publication_relation.prpubid
    where publication.pubname = 'supabase_realtime'
      and namespace.nspname = 'public'
      and relation.relname = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;
