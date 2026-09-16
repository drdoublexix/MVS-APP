alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text check (media_type in ('image', 'video'));

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do update set public = true;

create policy "Authenticated users can upload chat attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments');