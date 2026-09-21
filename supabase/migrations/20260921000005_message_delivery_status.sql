-- Track server delivery separately from recipient read state for chat receipts.
alter table public.messages
  add column if not exists is_delivered boolean not null default false;

create index if not exists messages_delivery_recipient_idx
  on public.messages (receiver_id, is_delivered)
  where is_delivered = false;

comment on column public.messages.is_delivered is 'True once the recipient client has received the message through Realtime.';
comment on column public.messages.is_read is 'True once the recipient opens the conversation containing the message.';
