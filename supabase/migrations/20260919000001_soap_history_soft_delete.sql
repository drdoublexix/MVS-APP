-- Soft-delete SOAP consultation histories only. Treatment timelines remain permanent.
alter table if exists public.pet_soap_records
  add column if not exists is_deleted boolean not null default false;

create index if not exists pet_soap_records_is_deleted_idx
  on public.pet_soap_records (is_deleted) where is_deleted = false;

drop policy if exists "Vets can update medical records" on public.pet_soap_records;
drop policy if exists "Vets can update pet soap records" on public.pet_soap_records;
create policy "Vets can update pet soap records" on public.pet_soap_records
  for update to authenticated
  using (auth.uid() = vet_id)
  with check (auth.uid() = vet_id);

alter table if exists public.farm_soap_records
  add column if not exists is_deleted boolean not null default false;

create index if not exists farm_soap_records_is_deleted_idx
  on public.farm_soap_records (is_deleted) where is_deleted = false;

drop policy if exists "Vets can update farm soap records" on public.farm_soap_records;
create policy "Vets can update farm soap records" on public.farm_soap_records
  for update to authenticated
  using (auth.uid() = vet_id)
  with check (auth.uid() = vet_id);
