create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public."user_role";
  requested_phone text;
  requested_license_number text;
  requested_is_verified boolean;
begin
  requested_role := (case lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'))
    when 'vet' then 'vet'
    when 'veterinarian' then 'vet'
    when 'paravet' then 'paravet'
    when 'merchant' then 'merchant'
    else 'client'
  end)::public."user_role";

  requested_phone := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');
  requested_license_number := case
    when requested_role in ('vet', 'paravet') then nullif(trim(new.raw_user_meta_data ->> 'license_number'), '')
    else null
  end;
  requested_is_verified := new.email_confirmed_at is not null;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    phone_number,
    license_number,
    is_verified,
    notification_preferences
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', '')),
    requested_role,
    requested_phone,
    requested_license_number,
    requested_is_verified,
    '{"chat": true, "orders": true, "vaccines": true, "consultations": true}'::jsonb
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
    license_number = coalesce(excluded.license_number, public.profiles.license_number),
    role = case
      when public.profiles.role = 'client' and requested_role in ('vet', 'paravet', 'merchant') then requested_role
      else public.profiles.role
    end,
    is_verified = public.profiles.is_verified or excluded.is_verified;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to authenticated, service_role;

drop function if exists public.admin_list_vet_applications(text, boolean, integer, integer);

create function public.admin_list_vet_applications(
  p_search text default null,
  p_is_approved boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone_number text,
  license_number text,
  specialty text,
  created_at timestamptz,
  is_vet_approved boolean,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select profiles.id, profiles.email, profiles.full_name, profiles.phone_number,
         profiles.license_number, profiles.specialty, profiles.created_at,
         profiles.is_vet_approved, profiles.role::text
  from public.profiles as profiles
  where profiles.role::text in ('vet', 'paravet')
    and profiles.deleted_at is null
    and profiles.is_vet_approved = coalesce(p_is_approved, false)
    and (
      p_search is null
      or profiles.email ilike '%' || p_search || '%'
      or profiles.full_name ilike '%' || p_search || '%'
      or profiles.license_number ilike '%' || p_search || '%'
    )
  order by profiles.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_set_vet_approval(
  p_vet_id uuid,
  p_is_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vet_email text;
  professional_role text;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_vet_id is null or p_is_approved is null then
    raise exception 'A veterinary professional and approval decision are required.';
  end if;
  if p_vet_id = (select auth.uid()) then
    raise exception 'You cannot change your own approval status.';
  end if;

  update public.profiles
  set is_vet_approved = p_is_approved
  where id = p_vet_id
    and role::text in ('vet', 'paravet')
    and deleted_at is null
  returning email, role::text into vet_email, professional_role;

  if not found then
    raise exception 'The active veterinary professional account could not be found.';
  end if;

  insert into public.activity_logs (user_id, action, resource_type, resource_id, details, status)
  values (
    (select auth.uid()),
    case when p_is_approved then 'vet_approved' else 'vet_unapproved' end,
    professional_role,
    p_vet_id,
    jsonb_build_object('email', vet_email),
    'success'
  );
end;
$$;

revoke all on function public.admin_list_vet_applications(text, boolean, integer, integer) from public, anon;
revoke all on function public.admin_set_vet_approval(uuid, boolean) from public, anon;
grant execute on function public.admin_list_vet_applications(text, boolean, integer, integer) to authenticated, service_role;
grant execute on function public.admin_set_vet_approval(uuid, boolean) to authenticated, service_role;

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
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    )
  );

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
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian', 'paravet')
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
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian', 'paravet')
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
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
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
      auth.uid() = farm_medical_records.vet_id
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text in ('vet', 'veterinarian', 'paravet')
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
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    )
  );

drop policy if exists "Vets can create farm medical records" on public.farm_medical_records;
create policy "Vets can create farm medical records" on public.farm_medical_records
  for insert to authenticated
  with check (
    auth.uid() = vet_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    )
  );

drop policy if exists "Vets can update farm medical records" on public.farm_medical_records;
create policy "Vets can update farm medical records" on public.farm_medical_records
  for update to authenticated
  using (auth.uid() = vet_id)
  with check (
    auth.uid() = vet_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    )
  );

drop policy if exists "Vets can delete farm medical records" on public.farm_medical_records;
create policy "Vets can delete farm medical records" on public.farm_medical_records
  for delete to authenticated
  using (
    auth.uid() = vet_id
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    )
  );

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
          and profiles.role::text in ('vet', 'veterinarian', 'paravet')
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
    raise exception 'Only MVS-verified veterinary professionals with a license can verify animal details'
      using errcode = '42501';
  end if;

  if vet_profile.role::text not in ('vet', 'veterinarian', 'paravet')
     or vet_profile.is_verified is distinct from true
     or nullif(trim(vet_profile.license_number), '') is null then
    raise exception 'Only MVS-verified veterinary professionals with a license can verify animal details'
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
    raise exception 'Select a valid veterinary professional.' using errcode = '22023';
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
    and profiles.role::text in ('vet', 'veterinarian', 'paravet')
    and profiles.is_vet_approved is true
    and profiles.deleted_at is null;
  if not found then
    raise exception 'This veterinary professional is not available for appointment requests.' using errcode = '22023';
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
    coalesce(nullif(trim(current_vet_name), ''), 'Veterinary professional'),
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

create or replace function public.manage_veterinary_appointment(
  p_appointment_id uuid,
  p_action text,
  p_scheduled_at timestamptz default null,
  p_response text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  appointment public.veterinary_appointments%rowtype;
  actor_is_vet boolean;
  next_status text;
  notification_user_id uuid;
  notification_title text;
  notification_body text;
  normalized_response text := nullif(left(trim(coalesce(p_response, '')), 500), '');
begin
  if current_user_id is null then
    raise exception 'Sign in to manage appointments.' using errcode = '42501';
  end if;

  select * into appointment
  from public.veterinary_appointments
  where id = p_appointment_id
  for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  actor_is_vet := appointment.vet_id = current_user_id;
  if not actor_is_vet and appointment.client_id <> current_user_id then
    raise exception 'You are not a participant in this appointment.' using errcode = '42501';
  end if;
  if actor_is_vet and not exists (
    select 1 from public.profiles
    where id = current_user_id
      and role::text in ('vet', 'veterinarian', 'paravet')
      and is_vet_approved is true
      and deleted_at is null
  ) then
    raise exception 'Only an active, approved veterinary professional can manage appointments.' using errcode = '42501';
  end if;
  if not actor_is_vet and not exists (
    select 1 from public.profiles
    where id = current_user_id
      and role::text = 'client'
      and deleted_at is null
  ) then
    raise exception 'Only an active client can manage this appointment.' using errcode = '42501';
  end if;

  if p_action in ('confirm', 'accept') then
    if p_action = 'confirm' and (not actor_is_vet or appointment.status <> 'pending') then
      raise exception 'Only the veterinary professional can confirm a pending request.' using errcode = '42501';
    end if;
    if p_action = 'accept' and (actor_is_vet or appointment.status <> 'proposed') then
      raise exception 'Only the client can accept a proposed time.' using errcode = '42501';
    end if;

    perform 1 from public.profiles where id = appointment.vet_id for update;
    if appointment.scheduled_at <= now() then
      raise exception 'An appointment in the past cannot be confirmed.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.veterinary_appointments other_appointment
      where other_appointment.vet_id = appointment.vet_id
        and other_appointment.id <> appointment.id
        and other_appointment.status = 'confirmed'
        and other_appointment.scheduled_at < appointment.scheduled_at + interval '30 minutes'
        and other_appointment.scheduled_at + interval '30 minutes' > appointment.scheduled_at
    ) then
      raise exception 'This time conflicts with another confirmed appointment. Propose another time.' using errcode = '23P01';
    end if;

    next_status := 'confirmed';
    notification_user_id := case when actor_is_vet then appointment.client_id else appointment.vet_id end;
    notification_title := 'Appointment confirmed';
    notification_body := appointment.vet_name || ' confirmed the appointment for '
      || appointment.pet_name || ' on '
      || to_char(appointment.scheduled_at at time zone 'UTC', 'Mon DD, YYYY "at" HH12:MI AM')
      || ' UTC.';
  elsif p_action = 'propose' then
    if not actor_is_vet or appointment.status not in ('pending', 'proposed', 'confirmed') then
      raise exception 'Only the veterinary professional can propose a new time for an active appointment.' using errcode = '42501';
    end if;
    if p_scheduled_at is null or p_scheduled_at <= now()
      or p_scheduled_at > now() + interval '90 days' then
      raise exception 'Choose a future appointment time within the next 90 days.' using errcode = '22023';
    end if;
    update public.veterinary_appointments
    set scheduled_at = p_scheduled_at,
        status = 'proposed',
        vet_response = normalized_response,
        updated_at = now()
    where id = appointment.id;
    notification_user_id := appointment.client_id;
    notification_title := 'New appointment time proposed';
    notification_body := appointment.vet_name || ' proposed a new time for '
      || appointment.pet_name || ': '
      || to_char(p_scheduled_at at time zone 'UTC', 'Mon DD, YYYY "at" HH12:MI AM')
      || ' UTC. Review it in your appointments.';
  elsif p_action = 'decline' then
    if not actor_is_vet or appointment.status not in ('pending', 'proposed') then
      raise exception 'Only the veterinary professional can decline a pending or rescheduled request.' using errcode = '42501';
    end if;
    next_status := 'declined';
    notification_user_id := appointment.client_id;
    notification_title := 'Appointment request declined';
    notification_body := appointment.vet_name || ' declined the appointment request for ' || appointment.pet_name || '.';
  elsif p_action = 'cancel' then
    if appointment.status not in ('pending', 'proposed', 'confirmed') then
      raise exception 'This appointment can no longer be cancelled.' using errcode = '22023';
    end if;
    if appointment.status = 'confirmed' and appointment.scheduled_at <= now() then
      raise exception 'A confirmed appointment that has already started cannot be cancelled.' using errcode = '22023';
    end if;
    next_status := 'cancelled';
    notification_user_id := case when actor_is_vet then appointment.client_id else appointment.vet_id end;
    notification_title := 'Appointment cancelled';
    notification_body := appointment.pet_name || '''s appointment was cancelled by '
      || case when actor_is_vet then appointment.vet_name else appointment.client_name end || '.';
  elsif p_action = 'complete' then
    if not actor_is_vet or appointment.status <> 'confirmed' then
      raise exception 'Only the veterinary professional can complete a confirmed appointment.' using errcode = '42501';
    end if;
    if appointment.scheduled_at + interval '30 minutes' > now() then
      raise exception 'An appointment can be completed after its scheduled 30-minute session.' using errcode = '22023';
    end if;
    next_status := 'completed';
    notification_user_id := appointment.client_id;
    notification_title := 'Appointment completed';
    notification_body := appointment.vet_name || ' marked the appointment for ' || appointment.pet_name || ' as complete.';
  else
    raise exception 'Unsupported appointment action.' using errcode = '22023';
  end if;

  if next_status is not null then
    update public.veterinary_appointments
    set status = next_status,
        vet_response = case when actor_is_vet then coalesce(normalized_response, vet_response) else vet_response end,
        updated_at = now()
    where id = appointment.id;
  end if;

  insert into public.notifications (user_id, title, body)
  values (notification_user_id, notification_title, notification_body);
end;
$$;

revoke all on function public.book_veterinary_appointment(uuid, text, uuid, uuid, text, text, timestamptz) from public, anon;
revoke all on function public.manage_veterinary_appointment(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.book_veterinary_appointment(uuid, text, uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.manage_veterinary_appointment(uuid, text, timestamptz, text) to authenticated;
