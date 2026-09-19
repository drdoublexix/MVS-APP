-- Farm and livestock treatment timeline.
create table if not exists public.farm_medical_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farm_records(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  vet_id uuid not null references auth.users(id) on delete restrict,
  treatment_type text not null,
  title text not null,
  dosage text,
  administered_date timestamptz not null default now(),
  next_due_date timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists farm_medical_records_farm_id_idx on public.farm_medical_records (farm_id, administered_date desc);
create index if not exists farm_medical_records_due_date_idx on public.farm_medical_records (next_due_date) where status = 'active';
create index if not exists farm_medical_records_client_id_idx on public.farm_medical_records (client_id);

alter table public.farm_medical_records enable row level security;

drop policy if exists "Farm owners and vets can view farm medical records" on public.farm_medical_records;
create policy "Farm owners and vets can view farm medical records" on public.farm_medical_records
  for select to authenticated
  using (
    auth.uid() = client_id
    or exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('vet', 'veterinarian'))
  );

drop policy if exists "Vets can create farm medical records" on public.farm_medical_records;
create policy "Vets can create farm medical records" on public.farm_medical_records
  for insert to authenticated
  with check (
    auth.uid() = vet_id
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('vet', 'veterinarian'))
  );

drop policy if exists "Vets can update farm medical records" on public.farm_medical_records;
create policy "Vets can update farm medical records" on public.farm_medical_records
  for update to authenticated
  using (auth.uid() = vet_id)
  with check (auth.uid() = vet_id);

drop policy if exists "Vets can delete farm medical records" on public.farm_medical_records;
create policy "Vets can delete farm medical records" on public.farm_medical_records
  for delete to authenticated
  using (auth.uid() = vet_id);

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
set search_path = public
as $$
  select
    record.id,
    record.client_id,
    record.farm_id,
    farm.species,
    record.title,
    (record.next_due_date::date - current_date)::integer,
    record.next_due_date
  from public.farm_medical_records record
  join public.farm_records farm on farm.id = record.farm_id
  where record.status = 'active'
    and record.next_due_date is not null
    and (record.next_due_date::date - current_date)::integer in (14, 7, 2);
$$;

grant execute on function public.get_due_farm_treatment_reminders() to service_role;
