alter table public.community_messages
  add column if not exists hidden_for_users jsonb not null default '[]'::jsonb;

create index if not exists community_messages_hidden_for_users_idx
  on public.community_messages using gin (hidden_for_users);