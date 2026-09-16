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
