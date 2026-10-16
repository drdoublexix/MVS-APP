alter table public.veterinary_clinics
  add column if not exists business_type text not null default 'veterinary_clinic',
  add column if not exists business_type_other text;

alter table public.veterinary_clinics
  drop constraint if exists veterinary_clinics_business_type_check;

alter table public.veterinary_clinics
  add constraint veterinary_clinics_business_type_check
  check (
    business_type in (
      'veterinary_clinic',
      'veterinary_hospital',
      'veterinary_practice',
      'pet_shop',
      'pet_supplies_store',
      'animal_feed_store',
      'pet_grooming_boarding',
      'animal_shelter',
      'other'
    )
    and (business_type <> 'other' or nullif(btrim(business_type_other), '') is not null)
  );
