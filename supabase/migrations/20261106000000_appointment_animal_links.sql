alter table public.veterinary_appointments
  add column if not exists animal_type text not null default 'pet',
  add column if not exists pet_id uuid references public.pets(id) on delete set null,
  add column if not exists farm_record_id uuid references public.farm_records(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'veterinary_appointments_animal_type_check'
      and conrelid = 'public.veterinary_appointments'::regclass
  ) then
    alter table public.veterinary_appointments
      add constraint veterinary_appointments_animal_type_check
      check (animal_type in ('pet', 'farm'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'veterinary_appointments_animal_reference'
      and conrelid = 'public.veterinary_appointments'::regclass
  ) then
    alter table public.veterinary_appointments
      add constraint veterinary_appointments_animal_reference check (
        num_nonnulls(pet_id, farm_record_id) <= 1
        and (pet_id is null or animal_type = 'pet')
        and (farm_record_id is null or animal_type = 'farm')
      );
  end if;
end;
$$;

drop function if exists public.book_veterinary_appointment(uuid, text, text, text, timestamptz);
create or replace function public.book_veterinary_appointment(
  p_vet_id uuid,
  p_animal_type text,
  p_pet_id uuid,
  p_farm_record_id uuid,
  p_appointment_type text,
  p_reason text,
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_client_name text;
  current_vet_name text;
  selected_animal_name text;
  new_appointment_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in to request an appointment.' using errcode = '42501';
  end if;
  if p_vet_id is null or p_vet_id = current_user_id then
    raise exception 'Select a valid veterinarian.' using errcode = '22023';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now()
    or p_scheduled_at > now() + interval '90 days' then
    raise exception 'Choose a future appointment time within the next 90 days.' using errcode = '22023';
  end if;
  if p_appointment_type is null or p_appointment_type not in ('in_person', 'online') then
    raise exception 'Choose an in-person or online appointment.' using errcode = '22023';
  end if;
  if p_animal_type is null
    or p_animal_type not in ('pet', 'farm')
    or num_nonnulls(p_pet_id, p_farm_record_id) <> 1
    or (p_animal_type = 'pet' and p_pet_id is null)
    or (p_animal_type = 'farm' and p_farm_record_id is null) then
    raise exception 'Select one pet or farm herd from your account.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'Describe what your pet or farm herd needs (3 to 2,000 characters).' using errcode = '22023';
  end if;

  select profiles.full_name into current_client_name
  from public.profiles
  where profiles.id = current_user_id
    and profiles.role::text = 'client'
    and profiles.deleted_at is null;
  if not found then
    raise exception 'Only active client accounts can request appointments.' using errcode = '42501';
  end if;

  select profiles.full_name into current_vet_name
  from public.profiles
  where profiles.id = p_vet_id
    and profiles.role::text in ('vet', 'veterinarian')
    and profiles.is_vet_approved is true
    and profiles.deleted_at is null;
  if not found then
    raise exception 'This veterinarian is not available for appointment requests.' using errcode = '22023';
  end if;

  if p_animal_type = 'pet' then
    select pets.name into selected_animal_name
    from public.pets
    where pets.id = p_pet_id and pets.owner_id = current_user_id;
  else
    select
      farm_records.species
      || case when nullif(trim(coalesce(farm_records.breed, '')), '') is not null then ' · ' || trim(farm_records.breed) else '' end
      || case when farm_records.flock_size is not null then ' · ' || farm_records.flock_size::text || ' animals' else '' end
    into selected_animal_name
    from public.farm_records
    where farm_records.id = p_farm_record_id and farm_records.client_id = current_user_id;
  end if;
  if not found or nullif(trim(coalesce(selected_animal_name, '')), '') is null then
    raise exception 'The selected pet or farm herd is not in your account.' using errcode = '42501';
  end if;
  selected_animal_name := left(selected_animal_name, 120);

  insert into public.veterinary_appointments (
    client_id, vet_id, client_name, vet_name, animal_type, pet_id, farm_record_id, pet_name,
    appointment_type, reason, scheduled_at
  )
  values (
    current_user_id, p_vet_id, coalesce(nullif(trim(current_client_name), ''), 'Client'),
    coalesce(nullif(trim(current_vet_name), ''), 'Veterinarian'),
    p_animal_type, p_pet_id, p_farm_record_id, selected_animal_name,
    p_appointment_type, trim(p_reason), p_scheduled_at
  )
  returning id into new_appointment_id;

  insert into public.notifications (user_id, title, body)
  values (
    p_vet_id,
    'New appointment request',
    coalesce(nullif(trim(current_client_name), ''), 'A client')
      || ' requested an appointment for ' || selected_animal_name || '.'
  );

  return new_appointment_id;
end;
$$;

revoke all on function public.book_veterinary_appointment(uuid, text, uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.book_veterinary_appointment(uuid, text, uuid, uuid, text, text, timestamptz) to authenticated;
