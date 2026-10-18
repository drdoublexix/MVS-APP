do $$
declare
  key_map record;
begin
  for key_map in
    select old_key, new_key
    from (values
      ('wound_management_mild', 'wound_management_minor_wound'),
      ('wound_management_severe', 'wound_management_serious_wound'),
      ('deworming_small', 'deworming_small_pet'),
      ('deworming_medium', 'deworming_medium_pet'),
      ('deworming_large', 'deworming_large_pet'),
      ('flea_tick_injectable_small', 'flea_tick_injection_small_animal'),
      ('flea_tick_injectable_medium', 'flea_tick_injection_medium_animal'),
      ('flea_tick_injectable_large', 'flea_tick_injection_large_animal'),
      ('flea_tick_tablet_small', 'flea_tick_tablet_small_animal'),
      ('flea_tick_tablet_medium', 'flea_tick_tablet_medium_animal'),
      ('flea_tick_tablet_large', 'flea_tick_tablet_large_animal'),
      ('essential_grooming_small', 'essential_grooming_small_pet'),
      ('essential_grooming_medium', 'essential_grooming_medium_pet'),
      ('essential_grooming_large', 'essential_grooming_large_pet'),
      ('signature_grooming_small', 'signature_grooming_small_pet'),
      ('signature_grooming_medium', 'signature_grooming_medium_pet'),
      ('signature_grooming_large', 'signature_grooming_large_pet')
    ) as mappings(old_key, new_key)
  loop
    update public.vet_service_pricing
    set service_prices = case
      when service_prices ? key_map.new_key then service_prices - key_map.old_key
      else jsonb_set(
        service_prices - key_map.old_key,
        array[key_map.new_key],
        service_prices -> key_map.old_key,
        true
      )
    end
    where service_prices ? key_map.old_key;
  end loop;

  for key_map in
    select old_key, new_key
    from (values
      ('routine_care', 'mvs_routine_care_plan'),
      ('grooming_club', 'mvs_grooming_wellness_plan'),
      ('total_care', 'mvs_total_care_package')
    ) as mappings(old_key, new_key)
  loop
    update public.vet_service_pricing
    set care_plan_prices = case
      when care_plan_prices ? key_map.new_key then care_plan_prices - key_map.old_key
      else jsonb_set(
        care_plan_prices - key_map.old_key,
        array[key_map.new_key],
        care_plan_prices -> key_map.old_key,
        true
      )
    end
    where care_plan_prices ? key_map.old_key;
  end loop;
end;
$$;

comment on column public.vet_service_pricing.service_prices is
  'Prices in Nigerian Naira keyed by canonical service and variant IDs, for example deworming_small_pet or flea_tick_injection_large_animal.';

comment on column public.vet_service_pricing.bundle_prices is
  'Prices in Nigerian Naira keyed by canonical bundle IDs, for example wellness_visit or first_year_starter.';

comment on column public.vet_service_pricing.care_plan_prices is
  'Prices in Nigerian Naira keyed by canonical MVS care plan IDs with billing periods nested under each plan, for example mvs_total_care_package with monthly, quarterly, or annual prices.';
