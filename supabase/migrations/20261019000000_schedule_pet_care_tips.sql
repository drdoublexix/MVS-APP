do $$
declare
  existing_job_id bigint;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'pet_tips_cron_secret'
      and decrypted_secret <> ''
  ) then
    raise exception 'Configure the pet_tips_cron_secret Vault secret before scheduling pet-care tips.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;

  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'send-pet-tips-mon-wed-fri'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'send-pet-tips-mon-wed-fri',
    '0 9 * * 1,3,5',
    $job$
      select net.http_post(
        url := 'https://hcblxipuwqbljmcfsrwz.supabase.co/functions/v1/send-scheduled-tips',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'pet_tips_cron_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
    $job$
  );
end;
$$;
