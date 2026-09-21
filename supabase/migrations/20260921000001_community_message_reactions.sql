alter table public.community_messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

comment on column public.community_messages.reactions is 'Map of user UUID to the user''s current emoji reaction for this community message.';
