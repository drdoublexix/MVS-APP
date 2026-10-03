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