create table if not exists public.veterinary_appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  vet_id uuid not null references public.profiles(id) on delete cascade,
  client_name text not null,
  vet_name text not null,
  animal_type text not null default 'pet' check (animal_type in ('pet', 'farm')),
  pet_id uuid references public.pets(id) on delete set null,
  farm_record_id uuid references public.farm_records(id) on delete set null,
  pet_name text not null,
  appointment_type text not null check (appointment_type in ('in_person', 'online')),
  reason text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'proposed', 'confirmed', 'declined', 'cancelled', 'completed')),
  vet_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint veterinary_appointments_different_parties check (client_id <> vet_id),
  constraint veterinary_appointments_animal_reference check (
    num_nonnulls(pet_id, farm_record_id) <= 1
    and (pet_id is null or animal_type = 'pet')
    and (farm_record_id is null or animal_type = 'farm')
  ),
  constraint veterinary_appointments_reason_length check (char_length(reason) between 3 and 2000),
  constraint veterinary_appointments_pet_name_length check (char_length(pet_name) between 1 and 120)
);

create index if not exists veterinary_appointments_vet_schedule_idx
  on public.veterinary_appointments (vet_id, scheduled_at);
create index if not exists veterinary_appointments_client_schedule_idx
  on public.veterinary_appointments (client_id, scheduled_at desc);
create index if not exists veterinary_appointments_vet_status_schedule_idx
  on public.veterinary_appointments (vet_id, status, scheduled_at);

alter table public.veterinary_appointments enable row level security;
revoke all on public.veterinary_appointments from public, anon, authenticated;
grant select on public.veterinary_appointments to authenticated;
grant all on public.veterinary_appointments to service_role;

drop policy if exists "Appointment participants can read appointments" on public.veterinary_appointments;
create policy "Appointment participants can read appointments"
  on public.veterinary_appointments
  for select to authenticated
  using (client_id = (select auth.uid()) or vet_id = (select auth.uid()));

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
  if p_appointment_type not in ('in_person', 'online') then
    raise exception 'Choose an in-person or online appointment.' using errcode = '22023';
  end if;
  if num_nonnulls(p_pet_id, p_farm_record_id) <> 1
    or (p_animal_type = 'pet' and p_pet_id is null)
    or (p_animal_type = 'farm' and p_farm_record_id is null)
    or p_animal_type not in ('pet', 'farm') then
    raise exception 'Select one pet or farm herd from your account.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'Describe what your pet needs (3 to 2,000 characters).' using errcode = '22023';
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
  if char_length(selected_animal_name) > 120 then
    selected_animal_name := left(selected_animal_name, 120);
  end if;

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
      and role::text in ('vet', 'veterinarian')
      and is_vet_approved is true
      and deleted_at is null
  ) then
    raise exception 'Only an active, approved veterinarian can manage appointments.' using errcode = '42501';
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
      raise exception 'Only the veterinarian can confirm a pending request.' using errcode = '42501';
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
      raise exception 'Only the veterinarian can propose a new time for an active appointment.' using errcode = '42501';
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
      raise exception 'Only the veterinarian can decline a pending or rescheduled request.' using errcode = '42501';
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
      raise exception 'Only the veterinarian can complete a confirmed appointment.' using errcode = '42501';
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

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'veterinary_appointments'
    ) then
    execute 'alter publication supabase_realtime add table public.veterinary_appointments';
  end if;
end;
$$;
