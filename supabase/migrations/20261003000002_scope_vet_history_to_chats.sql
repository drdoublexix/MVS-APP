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
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
      and exists (
        select 1
        from public.pets
        join public.consultations on consultations.client_id = pets.owner_id
        where pets.id = pet_medical_records.pet_id
          and consultations.vet_id = auth.uid()
          and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
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
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
      and exists (
        select 1
        from public.pets
        join public.consultations on consultations.client_id = pets.owner_id
        where pets.id = pet_soap_records.pet_id
          and consultations.vet_id = auth.uid()
          and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
      )
    )
  );

drop policy if exists "Vets can view farm records" on public.farm_records;
create policy "Vets can view farm records" on public.farm_records
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian')
    )
    and exists (
      select 1
      from public.consultations
      where consultations.client_id = farm_records.client_id
        and consultations.vet_id = auth.uid()
        and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
    )
  );

drop policy if exists "Farm owners and vets can view farm medical records" on public.farm_medical_records;
create policy "Farm owners and vets can view farm medical records" on public.farm_medical_records
  for select to authenticated
  using (
    auth.uid() = client_id
    or (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
      and exists (
        select 1
        from public.consultations
        where consultations.client_id = farm_medical_records.client_id
          and consultations.vet_id = auth.uid()
          and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
      )
    )
  );

drop policy if exists "Vets can view farm SOAP records" on public.farm_soap_records;
create policy "Vets can view farm SOAP records" on public.farm_soap_records
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian')
    )
    and exists (
      select 1
      from public.consultations
      where consultations.client_id = farm_soap_records.client_id
        and consultations.vet_id = auth.uid()
        and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
    )
  );