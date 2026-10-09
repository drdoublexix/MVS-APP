-- Clients can view all records for their animals; vets can view only records they authored.

drop policy if exists "Pet Parents and Vets can view medical records" on public.pet_medical_records;
create policy "Pet Parents and Vets can view medical records" on public.pet_medical_records
  for select to authenticated
  using (
    exists (
      select 1
      from public.pets
      where pets.id = pet_medical_records.pet_id
        and pets.owner_id = auth.uid()
    )
    or (
      auth.uid() = pet_medical_records.vet_id
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
    )
  );

drop policy if exists "Vets and Clients can view medical records for their pets" on public.pet_soap_records;
create policy "Vets and Clients can view medical records for their pets" on public.pet_soap_records
  for select to authenticated
  using (
    exists (
      select 1
      from public.pets
      where pets.id = pet_soap_records.pet_id
        and pets.owner_id = auth.uid()
    )
    or (
      auth.uid() = pet_soap_records.vet_id
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
    )
  );

drop policy if exists "Farm owners and vets can view farm medical records" on public.farm_medical_records;
create policy "Farm owners and vets can view farm medical records" on public.farm_medical_records
  for select to authenticated
  using (
    auth.uid() = farm_medical_records.client_id
    or (
      auth.uid() = farm_medical_records.vet_id
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
    )
  );

drop policy if exists "Clients can view their farm SOAP records" on public.farm_soap_records;
create policy "Clients can view their farm SOAP records" on public.farm_soap_records
  for select to authenticated
  using (auth.uid() = client_id);

drop policy if exists "Vets can view farm SOAP records" on public.farm_soap_records;
create policy "Vets can view farm SOAP records" on public.farm_soap_records
  for select to authenticated
  using (
    auth.uid() = farm_soap_records.vet_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian')
    )
  );
