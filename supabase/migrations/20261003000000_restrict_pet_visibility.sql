drop policy if exists "Vets can view client pets" on public.pets;
drop policy if exists "Vets can view pets of active consultation clients" on public.pets;

create policy "Vets can view pets of active consultation clients" on public.pets
  for select to authenticated
  using (
    exists (
      select 1
      from public.consultations
      where consultations.client_id = pets.owner_id
        and consultations.vet_id = auth.uid()
        and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
    )
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian')
    )
  );