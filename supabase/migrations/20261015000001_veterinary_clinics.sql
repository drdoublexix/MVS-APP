create table if not exists public.veterinary_clinics (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.profiles(id) on delete cascade,
  clinic_name text not null,
  practice_specialty text not null,
  description text,
  phone_number text not null,
  email text not null,
  address text not null,
  city text not null,
  state text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  profile_photo_url text,
  gallery_photo_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint veterinary_clinics_gallery_max_five check (cardinality(gallery_photo_urls) <= 5)
);

create index if not exists veterinary_clinics_location_idx
  on public.veterinary_clinics (latitude, longitude);

alter table public.veterinary_clinics enable row level security;

revoke all on public.veterinary_clinics from public, anon, authenticated;
grant select on public.veterinary_clinics to anon, authenticated;
grant insert, update, delete on public.veterinary_clinics to authenticated;
grant all on public.veterinary_clinics to service_role;

drop policy if exists "Anyone can view veterinary clinics" on public.veterinary_clinics;
create policy "Anyone can view veterinary clinics"
  on public.veterinary_clinics for select
  using (true);

drop policy if exists "Merchants can create their veterinary clinic" on public.veterinary_clinics;
create policy "Merchants can create their veterinary clinic"
  on public.veterinary_clinics for insert to authenticated
  with check (
    merchant_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

drop policy if exists "Merchants can update their veterinary clinic" on public.veterinary_clinics;
create policy "Merchants can update their veterinary clinic"
  on public.veterinary_clinics for update to authenticated
  using (
    merchant_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  )
  with check (
    merchant_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

drop policy if exists "Merchants can delete their veterinary clinic" on public.veterinary_clinics;
create policy "Merchants can delete their veterinary clinic"
  on public.veterinary_clinics for delete to authenticated
  using (
    merchant_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

create table if not exists public.veterinary_clinic_ratings (
  clinic_id uuid not null references public.veterinary_clinics(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, client_id)
);

alter table public.veterinary_clinic_ratings enable row level security;

revoke all on public.veterinary_clinic_ratings from public, anon, authenticated;
grant select, insert, update on public.veterinary_clinic_ratings to authenticated;
grant all on public.veterinary_clinic_ratings to service_role;

drop policy if exists "Clients can view their veterinary clinic ratings" on public.veterinary_clinic_ratings;
create policy "Clients can view their veterinary clinic ratings"
  on public.veterinary_clinic_ratings for select to authenticated
  using (client_id = auth.uid());

drop policy if exists "Clients can rate veterinary clinics" on public.veterinary_clinic_ratings;
create policy "Clients can rate veterinary clinics"
  on public.veterinary_clinic_ratings for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'client'
    )
  );

drop policy if exists "Clients can update their veterinary clinic ratings" on public.veterinary_clinic_ratings;
create policy "Clients can update their veterinary clinic ratings"
  on public.veterinary_clinic_ratings for update to authenticated
  using (client_id = auth.uid())
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'client'
    )
  );

create or replace function public.get_veterinary_clinic_rating_summary(target_clinic_id uuid)
returns table (average_rating numeric, total_reviews bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(round(avg(rating)::numeric, 1), 0), count(*)
  from public.veterinary_clinic_ratings
  where clinic_id = target_clinic_id;
$$;

revoke all on function public.get_veterinary_clinic_rating_summary(uuid) from public, anon;
grant execute on function public.get_veterinary_clinic_rating_summary(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-images',
  'clinic-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Merchants can upload their own clinic images" on storage.objects;
create policy "Merchants can upload their own clinic images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clinic-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

drop policy if exists "Merchants can update their own clinic images" on storage.objects;
create policy "Merchants can update their own clinic images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'clinic-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  )
  with check (
    bucket_id = 'clinic-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

drop policy if exists "Merchants can delete their own clinic images" on storage.objects;
create policy "Merchants can delete their own clinic images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'clinic-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role::text = 'merchant'
    )
  );

drop policy if exists "Merchants can upload clinic images to their own folder" on storage.objects;
create policy "Merchants can upload clinic images to their own folder"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'clinic-images'
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text = 'merchant'
      )
    )
  );

drop policy if exists "Merchants can update clinic images in their own folder" on storage.objects;
create policy "Merchants can update clinic images in their own folder"
  on storage.objects as restrictive for update to authenticated
  using (
    bucket_id <> 'clinic-images'
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text = 'merchant'
      )
    )
  )
  with check (
    bucket_id <> 'clinic-images'
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text = 'merchant'
      )
    )
  );

drop policy if exists "Merchants can delete clinic images in their own folder" on storage.objects;
create policy "Merchants can delete clinic images in their own folder"
  on storage.objects as restrictive for delete to authenticated
  using (
    bucket_id <> 'clinic-images'
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role::text = 'merchant'
      )
    )
  );
