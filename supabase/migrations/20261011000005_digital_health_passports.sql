create table if not exists public.digital_passports (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid unique references public.pets(id) on delete cascade,
  farm_record_id uuid unique references public.farm_records(id) on delete cascade,
  access_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  verified_species text,
  verified_breed text,
  species_verified_at timestamptz,
  species_verified_by uuid references public.profiles(id) on delete set null,
  breed_verified_at timestamptz,
  breed_verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint digital_passports_animal_check
    check ((pet_id is not null) <> (farm_record_id is not null))
);

create index if not exists digital_passports_access_token_idx
  on public.digital_passports (access_token);

alter table public.digital_passports enable row level security;

drop policy if exists "Owners and authorized vets can view digital passports" on public.digital_passports;
create policy "Owners and authorized vets can view digital passports"
  on public.digital_passports
  for select to authenticated
  using (
    exists (
      select 1
      from public.pets
      where pets.id = digital_passports.pet_id
        and pets.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.farm_records
      where farm_records.id = digital_passports.farm_record_id
        and farm_records.client_id = auth.uid()
    )
    or (
      exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian')
      )
      and exists (
        select 1
        from public.consultations
        where consultations.vet_id = auth.uid()
          and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
          and (
            consultations.client_id = (
              select pets.owner_id
              from public.pets
              where pets.id = digital_passports.pet_id
            )
            or consultations.client_id = (
              select farm_records.client_id
              from public.farm_records
              where farm_records.id = digital_passports.farm_record_id
            )
          )
      )
    )
  );

revoke all on public.digital_passports from public, anon, authenticated;
grant select on public.digital_passports to authenticated;

create or replace function public.create_pet_digital_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.digital_passports (pet_id)
  values (new.id)
  on conflict (pet_id) do nothing;
  return new;
end;
$$;

create or replace function public.create_farm_digital_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.digital_passports (farm_record_id)
  values (new.id)
  on conflict (farm_record_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_pet_digital_passport on public.pets;
create trigger create_pet_digital_passport
  after insert on public.pets
  for each row execute function public.create_pet_digital_passport();

drop trigger if exists create_farm_digital_passport on public.farm_records;
create trigger create_farm_digital_passport
  after insert on public.farm_records
  for each row execute function public.create_farm_digital_passport();

insert into public.digital_passports (pet_id)
select pets.id
from public.pets
on conflict (pet_id) do nothing;

insert into public.digital_passports (farm_record_id)
select farm_records.id
from public.farm_records
on conflict (farm_record_id) do nothing;

create or replace function public.verify_digital_passport_animal_details(p_passport_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  passport_row public.digital_passports%rowtype;
  owner_id uuid;
  animal_species text;
  animal_breed text;
  vet_profile record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select role, is_verified, license_number
  into vet_profile
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Only MVS-verified veterinarians with a license can verify animal details'
      using errcode = '42501';
  end if;

  if vet_profile.role::text not in ('vet', 'veterinarian')
     or vet_profile.is_verified is distinct from true
     or nullif(trim(vet_profile.license_number), '') is null then
    raise exception 'Only MVS-verified veterinarians with a license can verify animal details'
      using errcode = '42501';
  end if;

  select *
  into passport_row
  from public.digital_passports
  where id = p_passport_id and is_active;

  if not found then
    raise exception 'Digital passport not found';
  end if;

  if passport_row.pet_id is not null then
    select pets.owner_id, pets.type, pets.breed
    into owner_id, animal_species, animal_breed
    from public.pets
    where pets.id = passport_row.pet_id;
  else
    select farm_records.client_id, farm_records.species, farm_records.breed
    into owner_id, animal_species, animal_breed
    from public.farm_records
    where farm_records.id = passport_row.farm_record_id;
  end if;

  if not exists (
    select 1
    from public.consultations
    where consultations.client_id = owner_id
      and consultations.vet_id = auth.uid()
      and auth.uid()::text <> all(coalesce(consultations.deleted_by_user_ids, '{}'::text[]))
  ) then
    raise exception 'An active consultation with the record owner is required'
      using errcode = '42501';
  end if;

  update public.digital_passports
  set verified_species = animal_species,
      verified_breed = animal_breed,
      species_verified_at = pg_catalog.now(),
      species_verified_by = auth.uid(),
      breed_verified_at = pg_catalog.now(),
      breed_verified_by = auth.uid()
  where id = passport_row.id;
end;
$$;

revoke all on function public.verify_digital_passport_animal_details(uuid) from public, anon;
grant execute on function public.verify_digital_passport_animal_details(uuid) to authenticated;

create or replace function public.get_public_digital_passport(
  p_passport_id uuid,
  p_access_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  passport_row public.digital_passports%rowtype;
  result jsonb;
begin
  select *
  into passport_row
  from public.digital_passports
  where id = p_passport_id
    and access_token = p_access_token
    and is_active;

  if not found then
    return null;
  end if;

  if passport_row.pet_id is not null then
    select jsonb_build_object(
      'id', passport_row.id,
      'record_type', 'pet',
      'name', pets.name,
      'species', pets.type,
      'breed', pets.breed,
      'species_verified', passport_row.species_verified_at is not null
        and passport_row.verified_species is not distinct from pets.type,
      'breed_verified', passport_row.breed_verified_at is not null
        and passport_row.verified_breed is not distinct from pets.breed,
      'species_verified_by', (
        select jsonb_build_object('name', verifier.full_name, 'license_number', verifier.license_number)
        from public.profiles verifier
        where verifier.id = passport_row.species_verified_by
      ),
      'breed_verified_by', (
        select jsonb_build_object('name', verifier.full_name, 'license_number', verifier.license_number)
        from public.profiles verifier
        where verifier.id = passport_row.breed_verified_by
      ),
      'owner_name', coalesce(profiles.full_name, 'Pet owner'),
      'vaccination_status_reported', pets.vaccination_status,
      'active_medical_status', case
        when exists (
          select 1 from public.pet_medical_records records
          where records.pet_id = pets.id
            and records.next_due_date > pg_catalog.now()
        ) then 'Follow-up care scheduled'
        when exists (
          select 1 from public.pet_medical_records records
          where records.pet_id = pets.id
        ) then 'No active follow-up currently recorded'
        else 'No verified medical status recorded'
      end,
      'medical_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'treatment_type', records.treatment_type,
          'title', records.title,
          'administered_date', records.administered_date,
          'next_due_date', records.next_due_date,
          'dose_series_number', records.dose_series_number,
          'total_series_doses', records.total_series_doses,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_license_number', vets.license_number,
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.administered_date desc)
        from public.pet_medical_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.pet_id = pets.id
      ), '[]'::jsonb),
      'issued_at', passport_row.created_at
    )
    into result
    from public.pets
    left join public.profiles on profiles.id = pets.owner_id
    where pets.id = passport_row.pet_id;
  else
    select jsonb_build_object(
      'id', passport_row.id,
      'record_type', 'farm',
      'name', farm_records.species || ' livestock record',
      'species', farm_records.species,
      'breed', farm_records.breed,
      'species_verified', passport_row.species_verified_at is not null
        and passport_row.verified_species is not distinct from farm_records.species,
      'breed_verified', passport_row.breed_verified_at is not null
        and passport_row.verified_breed is not distinct from farm_records.breed,
      'species_verified_by', (
        select jsonb_build_object('name', verifier.full_name, 'license_number', verifier.license_number)
        from public.profiles verifier
        where verifier.id = passport_row.species_verified_by
      ),
      'breed_verified_by', (
        select jsonb_build_object('name', verifier.full_name, 'license_number', verifier.license_number)
        from public.profiles verifier
        where verifier.id = passport_row.breed_verified_by
      ),
      'flock_size', farm_records.flock_size,
      'owner_name', coalesce(profiles.full_name, 'Farm owner'),
      'active_medical_status', case
        when exists (
          select 1 from public.farm_medical_records records
          where records.farm_id = farm_records.id
            and records.status = 'active'
            and (records.next_due_date is null or records.next_due_date > pg_catalog.now())
        ) then 'Active or scheduled care recorded'
        when exists (
          select 1 from public.farm_medical_records records
          where records.farm_id = farm_records.id
        ) then 'No active treatment currently recorded'
        else 'No verified medical status recorded'
      end,
      'medical_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'treatment_type', records.treatment_type,
          'title', records.title,
          'administered_date', records.administered_date,
          'next_due_date', records.next_due_date,
          'dosage', records.dosage,
          'status', records.status,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_license_number', vets.license_number,
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.administered_date desc)
        from public.farm_medical_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.farm_id = farm_records.id
      ), '[]'::jsonb),
      'issued_at', passport_row.created_at
    )
    into result
    from public.farm_records
    left join public.profiles on profiles.id = farm_records.client_id
    where farm_records.id = passport_row.farm_record_id;
  end if;

  return result;
end;
$$;

revoke all on function public.get_public_digital_passport(uuid, text) from public;
grant execute on function public.get_public_digital_passport(uuid, text) to anon, authenticated;
