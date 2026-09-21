alter table public.messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

comment on column public.messages.reactions is 'Map of user UUID to the user''s current emoji reaction for this message.';
