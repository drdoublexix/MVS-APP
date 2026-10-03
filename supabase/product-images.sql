alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists stock integer not null default 0;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Product owners can upload product images" on storage.objects;

create policy "Product owners can upload product images"
on storage.objects for insert to authenticated
with check (
	bucket_id = 'product-images'
	and (storage.foldername(name))[1] = auth.uid()::text
);