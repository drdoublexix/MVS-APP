drop index if exists public.notifications_reminder_dedupe_key_idx;

create unique index notifications_reminder_dedupe_key_idx
  on public.notifications (reminder_dedupe_key);

do $$
declare
  reminder_job_id bigint;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'vaccine_reminder_cron_secret'
  ) then
    raise exception 'Configure the vaccine_reminder_cron_secret Vault secret before enabling treatment reminders.';
  end if;

  select jobid
  into reminder_job_id
  from cron.job
  where jobname = 'daily-vaccine-reminder'
    and active;

  if not found then
    raise exception 'The active daily-vaccine-reminder cron job was not found.';
  end if;

  perform cron.alter_job(
    job_id := reminder_job_id,
    command := $job$
      select net.http_post(
        url := 'https://hcblxipuwqbljmcfsrwz.supabase.co/functions/v1/send-vaccine-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'vaccine_reminder_cron_secret'
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
    $job$
  );
end;
$$;
