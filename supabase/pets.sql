-- 1. Create public.pets table
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null, -- Dog, Cat, etc.
  breed text,
  dob date, -- Date of Birth
  vaccination_status text default 'Not Vaccinated',
  medical_notes text,
  photos text[] default '{}', -- Array of image URLs/paths
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- 2. Indexes for fast queries
create index if not exists pets_owner_id_idx on public.pets (owner_id);

-- 3. Enable Row Level Security (RLS)
alter table public.pets enable row level security;

-- 4. RLS Policies
drop policy if exists "Pet owners can manage their pets" on public.pets;
drop policy if exists "Vets can view pets of active consultation clients" on public.pets;

-- Allow pet parents full control over their own pet records
create policy "Pet owners can manage their pets" on public.pets
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Allow veterinarians and authenticated users involved in consultations to view pets
create policy "Vets can view pets of active consultation clients" on public.pets
  for select to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Pet owners can upload pet images" on storage.objects;
drop policy if exists "Anyone can view pet images" on storage.objects;

create policy "Pet owners can upload pet images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pet-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Anyone can view pet images" on storage.objects
  for select to public
  using (bucket_id = 'pet-images');