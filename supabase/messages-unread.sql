alter table public.messages
  add column if not exists is_read boolean not null default false;

alter table public.messages
  add column if not exists is_delivered boolean not null default false;

create index if not exists messages_unread_recipient_idx
  on public.messages (receiver_id, is_read)
  where is_read = false;

create index if not exists messages_delivery_recipient_idx
  on public.messages (receiver_id, is_delivered)
  where is_delivered = false;

alter table public.messages enable row level security;
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Message participants can mark messages as read'
  ) then
    create policy "Message participants can mark messages as read"
      on public.messages
      for update
      to authenticated
      using (auth.uid()::text = sender_id or auth.uid()::text = receiver_id)
      with check (auth.uid()::text = sender_id or auth.uid()::text = receiver_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Message senders can delete their messages'
  ) then
    create policy "Message senders can delete their messages"
      on public.messages
      for delete
      to authenticated
      using (auth.uid()::text = sender_id);
  end if;
end
$$;