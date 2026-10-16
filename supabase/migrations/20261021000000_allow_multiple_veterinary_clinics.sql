alter table public.veterinary_clinics
  drop constraint if exists veterinary_clinics_merchant_id_key;

create index if not exists veterinary_clinics_merchant_id_idx
  on public.veterinary_clinics (merchant_id);
