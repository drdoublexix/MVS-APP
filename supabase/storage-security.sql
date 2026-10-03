-- Keep direct public file URLs working while preventing public bucket listing.
-- Public buckets do not require storage.objects SELECT policies for file reads.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('product-images', 'product-images', true),
  ('chat-attachments', 'chat-attachments', true),
  ('community-uploads', 'community-uploads', true),
  ('voice-notes', 'voice-notes', true)
on conflict (id) do update set public = true;

-- Remove any SELECT policy targeting these buckets. A public SELECT policy on
-- storage.objects enables object listing through the Storage API.
do $$
declare
  policy_record record;
  bucket_id text;
begin
  foreach bucket_id in array array[
    'avatars',
    'product-images',
    'chat-attachments',
    'community-uploads',
    'voice-notes'
  ] loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and cmd = 'SELECT'
        and (
          qual ilike '%' || bucket_id || '%'
          or with_check ilike '%' || bucket_id || '%'
        )
    loop
      execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
    end loop;
  end loop;
end
$$;

drop policy if exists "Restrict avatar uploads to owner paths" on storage.objects;
create policy "Restrict avatar uploads to owner paths"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'avatars' or (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Restrict community uploads to owner paths" on storage.objects;
create policy "Restrict community uploads to owner paths"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'community-uploads' or (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Restrict voice note uploads to owner paths" on storage.objects;
create policy "Restrict voice note uploads to owner paths"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'voice-notes' or (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Restrict pet image uploads to owner paths" on storage.objects;
create policy "Restrict pet image uploads to owner paths"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'pet-images' or (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Restrict product image uploads to owner paths" on storage.objects;
create policy "Restrict product image uploads to owner paths"
on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'product-images' or (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Restrict chat uploads to conversation participants" on storage.objects;
create policy "Restrict chat uploads to conversation participants"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'chat-attachments'
  or (
    (storage.foldername(name))[1] ~ '^conv_[0-9a-f-]{36}_[0-9a-f-]{36}$'
    and (
      lower(split_part((storage.foldername(name))[1], '_', 2)) = auth.uid()::text
      or lower(split_part((storage.foldername(name))[1], '_', 3)) = auth.uid()::text
    )
  )
);

update storage.buckets
set file_size_limit = 10485760
where id in ('avatars', 'product-images', 'community-uploads', 'pet-images', 'voice-notes');

update storage.buckets
set file_size_limit = 104857600
where id = 'chat-attachments';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
where id in ('avatars', 'product-images', 'community-uploads', 'pet-images');

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'video/mp4', 'video/quicktime', 'video/3gpp']
where id = 'chat-attachments';

update storage.buckets
set allowed_mime_types = array['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/ogg']
where id = 'voice-notes';
