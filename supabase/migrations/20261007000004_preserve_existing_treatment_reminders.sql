update public.notifications
set reminder_dedupe_key =
  regexp_replace(
    reminder_dedupe_key,
    ':(14|2)$',
    case
      when reminder_dedupe_key ~ ':14$' then ':2 weeks'
      else ':2 days'
    end
  ) || ':' || user_id::text
where reminder_dedupe_key ~ '^(pet|farm):.*:(14|2)$';

drop function if exists public.get_due_vaccination_reminders();

create function public.get_due_vaccination_reminders()
returns table (
  record_id uuid,
  pet_id uuid,
  pet_name text,
  owner_id uuid,
  vet_id uuid,
  treatment_title text,
  dose_info text,
  due_date timestamptz,
  days_remaining integer,
  reminder_label text
)
language sql
security definer
set search_path = ''
as $$
  select
    medical_record.id,
    medical_record.pet_id,
    pet.name,
    pet.owner_id,
    medical_record.vet_id,
    medical_record.title,
    case
      when medical_record.total_series_doses > 1 then
        'Dose ' || coalesce(medical_record.dose_series_number, 1)::text
        || ' of ' || medical_record.total_series_doses::text
      else 'Annual/Routine Booster'
    end,
    medical_record.next_due_date,
    (due_dates.due_local_date - due_dates.today_local_date)::integer,
    case
      when due_dates.today_local_date = (due_dates.due_local_date - interval '2 months')::date then '2 months'
      when due_dates.today_local_date = (due_dates.due_local_date - interval '1 month')::date then '1 month'
      when due_dates.today_local_date = due_dates.due_local_date - 14 then '2 weeks'
      when due_dates.today_local_date = due_dates.due_local_date - 2 then '2 days'
      else 'today'
    end
  from public.pet_medical_records as medical_record
  join public.pets as pet on pet.id = medical_record.pet_id
  cross join lateral (
    select
      (medical_record.next_due_date at time zone 'Africa/Lagos')::date as due_local_date,
      (pg_catalog.now() at time zone 'Africa/Lagos')::date as today_local_date
  ) as due_dates
  where medical_record.next_due_date is not null
    and due_dates.today_local_date in (
      (due_dates.due_local_date - interval '2 months')::date,
      (due_dates.due_local_date - interval '1 month')::date,
      due_dates.due_local_date - 14,
      due_dates.due_local_date - 2,
      due_dates.due_local_date
    );
$$;

revoke all on function public.get_due_vaccination_reminders() from public, anon, authenticated;
grant execute on function public.get_due_vaccination_reminders() to service_role;
