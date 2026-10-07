alter table public.notifications
  add column if not exists reminder_dedupe_key text;

create unique index if not exists notifications_reminder_dedupe_key_idx
  on public.notifications (reminder_dedupe_key)
  where reminder_dedupe_key is not null;

create or replace function public.get_due_vaccination_reminders()
returns table (
  record_id uuid,
  pet_name text,
  owner_id uuid,
  treatment_title text,
  dose_info text,
  due_date timestamptz,
  days_remaining integer
)
language sql
security definer
set search_path = ''
as $$
  select
    medical_record.id,
    pet.name,
    pet.owner_id,
    medical_record.title,
    case
      when medical_record.total_series_doses > 1 then
        'Dose ' || coalesce(medical_record.dose_series_number, 1)::text
        || ' of ' || medical_record.total_series_doses::text
      else 'Annual/Routine Booster'
    end,
    medical_record.next_due_date,
    (
      (medical_record.next_due_date at time zone 'Africa/Lagos')::date
      - (pg_catalog.now() at time zone 'Africa/Lagos')::date
    )::integer
  from public.pet_medical_records as medical_record
  join public.pets as pet on pet.id = medical_record.pet_id
  where medical_record.next_due_date is not null
    and (
      (medical_record.next_due_date at time zone 'Africa/Lagos')::date
      - (pg_catalog.now() at time zone 'Africa/Lagos')::date
    ) in (14, 7, 2);
$$;

revoke all on function public.get_due_vaccination_reminders() from public, anon, authenticated;
grant execute on function public.get_due_vaccination_reminders() to service_role;

create or replace function public.get_due_farm_treatment_reminders()
returns table (
  record_id uuid,
  owner_id uuid,
  farm_id uuid,
  species text,
  treatment_title text,
  days_remaining integer,
  next_due_date timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    medical_record.id,
    medical_record.client_id,
    medical_record.farm_id,
    farm.species,
    medical_record.title,
    (
      (medical_record.next_due_date at time zone 'Africa/Lagos')::date
      - (pg_catalog.now() at time zone 'Africa/Lagos')::date
    )::integer,
    medical_record.next_due_date
  from public.farm_medical_records as medical_record
  join public.farm_records as farm on farm.id = medical_record.farm_id
  where medical_record.status = 'active'
    and medical_record.next_due_date is not null
    and (
      (medical_record.next_due_date at time zone 'Africa/Lagos')::date
      - (pg_catalog.now() at time zone 'Africa/Lagos')::date
    ) in (14, 7, 2);
$$;

revoke all on function public.get_due_farm_treatment_reminders() from public, anon, authenticated;
grant execute on function public.get_due_farm_treatment_reminders() to service_role;
