alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text check (media_type in ('image', 'video'));

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload chat attachments" on storage.objects;
drop policy if exists "Chat participants can upload chat attachments" on storage.objects;

create policy "Chat participants can upload chat attachments"
on storage.objects for insert to authenticated
with check (
	bucket_id = 'chat-attachments'
	and (storage.foldername(name))[1] ~ '^conv_[0-9a-f-]{36}_[0-9a-f-]{36}$'
	and (
		lower(split_part((storage.foldername(name))[1], '_', 2)) = auth.uid()::text
		or lower(split_part((storage.foldername(name))[1], '_', 3)) = auth.uid()::text
	)
);