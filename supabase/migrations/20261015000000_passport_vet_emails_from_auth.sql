create or replace function public.get_complete_public_digital_passport(
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
  passport_details jsonb;
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

  passport_details := public.get_public_digital_passport(p_passport_id, p_access_token);
  if passport_details is null then
    return null;
  end if;

  passport_details := jsonb_set(
    passport_details,
    '{species_verified_by}',
    jsonb_build_object(
      'name', passport_details #>> '{species_verified_by,name}',
      'email', (select users.email from auth.users users where users.id = passport_row.species_verified_by)
    ),
    true
  );
  passport_details := jsonb_set(
    passport_details,
    '{breed_verified_by}',
    jsonb_build_object(
      'name', passport_details #>> '{breed_verified_by,name}',
      'email', (select users.email from auth.users users where users.id = passport_row.breed_verified_by)
    ),
    true
  );

  if passport_row.pet_id is not null then
    select jsonb_build_object(
      'record_details', jsonb_build_object(
        'date_of_birth', pets.dob,
        'medical_notes', pets.medical_notes
      ),
      'medical_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', records.id,
          'treatment_type', records.treatment_type,
          'title', records.title,
          'administered_date', records.administered_date,
          'next_due_date', records.next_due_date,
          'dose_series_number', records.dose_series_number,
          'total_series_doses', records.total_series_doses,
          'dosage', null,
          'notes', records.notes,
          'status', null,
          'follow_up_status', case
            when records.next_due_date is null then 'No follow-up scheduled'
            when records.next_due_date < pg_catalog.now() then 'Overdue'
            when records.next_due_date <= pg_catalog.now() + interval '14 days' then 'Due soon'
            else 'Up to date'
          end,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_email', (select users.email from auth.users users where users.id = records.vet_id),
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.administered_date desc)
        from public.pet_medical_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.pet_id = pets.id
      ), '[]'::jsonb),
      'soap_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', records.id,
          'created_at', records.created_at,
          'subjective', records.subjective,
          'objective', records.objective,
          'assessment', records.assessment,
          'tentative_diagnosis', null,
          'plan', records.plan,
          'weight_kg', records.weight_kg,
          'temperature_c', records.temperature_c,
          'heart_rate_bpm', records.heart_rate_bpm,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_email', (select users.email from auth.users users where users.id = records.vet_id),
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.created_at desc)
        from public.pet_soap_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.pet_id = pets.id
          and records.is_deleted = false
      ), '[]'::jsonb)
    )
    into result
    from public.pets
    where pets.id = passport_row.pet_id;
  else
    select jsonb_build_object(
      'record_details', jsonb_build_object(
        'location', farm_records.location,
        'restock_date', farm_records.restock_date,
        'medical_log', farm_records.medical_log,
        'production_summary', farm_records.production_summary
      ),
      'medical_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', records.id,
          'treatment_type', records.treatment_type,
          'title', records.title,
          'administered_date', records.administered_date,
          'next_due_date', records.next_due_date,
          'dose_series_number', null,
          'total_series_doses', null,
          'dosage', records.dosage,
          'notes', records.notes,
          'status', records.status,
          'follow_up_status', case
            when records.status = 'cancelled' then 'Cancelled'
            when records.status = 'completed' then 'Completed'
            when records.next_due_date is null then 'No follow-up scheduled'
            when records.next_due_date < pg_catalog.now() then 'Overdue'
            when records.next_due_date <= pg_catalog.now() + interval '14 days' then 'Due soon'
            else 'Up to date'
          end,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_email', (select users.email from auth.users users where users.id = records.vet_id),
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.administered_date desc)
        from public.farm_medical_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.farm_id = farm_records.id
      ), '[]'::jsonb),
      'soap_records', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', records.id,
          'created_at', records.created_at,
          'subjective', records.subjective,
          'objective', records.objective,
          'assessment', null,
          'tentative_diagnosis', records.tentative_diagnosis,
          'plan', records.plan,
          'weight_kg', null,
          'temperature_c', null,
          'heart_rate_bpm', null,
          'vet_name', coalesce(vets.full_name, 'Veterinarian'),
          'vet_email', (select users.email from auth.users users where users.id = records.vet_id),
          'vet_verified', coalesce(vets.is_verified, false)
        ) order by records.created_at desc)
        from public.farm_soap_records records
        left join public.profiles vets on vets.id = records.vet_id
        where records.farm_id = farm_records.id
          and records.is_deleted = false
      ), '[]'::jsonb)
    )
    into result
    from public.farm_records
    where farm_records.id = passport_row.farm_record_id;
  end if;

  return passport_details || coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_complete_public_digital_passport(uuid, text) from public;
grant execute on function public.get_complete_public_digital_passport(uuid, text) to anon, authenticated;
