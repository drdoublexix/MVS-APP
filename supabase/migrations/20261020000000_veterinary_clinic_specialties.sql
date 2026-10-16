alter table public.veterinary_clinics
  add column if not exists practice_specialties text[] not null default '{}';

update public.veterinary_clinics
set practice_specialties = array(
  select btrim(specialty)
  from unnest(string_to_array(practice_specialty, ',')) as specialties(specialty)
  where btrim(specialty) <> ''
)
where cardinality(practice_specialties) = 0;

alter table public.veterinary_clinics
  add constraint veterinary_clinics_specialties_nonempty
  check (
    cardinality(practice_specialties) > 0
    and array_position(practice_specialties, '') is null
  );
