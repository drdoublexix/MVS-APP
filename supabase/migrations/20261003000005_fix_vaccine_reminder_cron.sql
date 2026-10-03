do $$
declare
  reminder_job record;
begin
  select jobid, command
  into reminder_job
  from cron.job
  where jobname = 'daily-vaccine-reminder'
    and active;

  if found
    and position('/send-vaccine-reminder' in reminder_job.command) > 0
    and position('/send-vaccine-reminders' in reminder_job.command) = 0 then
    perform cron.alter_job(
      job_id := reminder_job.jobid,
      command := replace(reminder_job.command, '/send-vaccine-reminder', '/send-vaccine-reminders')
    );
  end if;
end;
$$;