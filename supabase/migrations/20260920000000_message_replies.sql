alter table public.messages
  add column if not exists reply_to jsonb;

alter table public.community_messages
  add column if not exists reply_to jsonb;

comment on column public.messages.reply_to is 'Snapshot of the replied-to message: id, sender_name, and content.';
comment on column public.community_messages.reply_to is 'Snapshot of the replied-to message: id, sender_name, and content.';