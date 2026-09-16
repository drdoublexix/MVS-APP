-- Invoices are commercial payment requests and are intentionally separate from orders.
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'paid', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz
);

create index if not exists invoices_conversation_idx on public.invoices (conversation_id);
create index if not exists invoices_participants_idx on public.invoices (buyer_id, merchant_id);

alter table public.invoices enable row level security;

drop policy if exists "Invoice participants can view invoices" on public.invoices;
drop policy if exists "Merchants can create invoices" on public.invoices;
drop policy if exists "Buyers can pay invoices" on public.invoices;

create policy "Invoice participants can view invoices" on public.invoices
for select to authenticated
using (auth.uid() = buyer_id or auth.uid() = merchant_id);

create policy "Merchants can create invoices" on public.invoices
for insert to authenticated
with check (auth.uid() = merchant_id);

create policy "Buyers can pay invoices" on public.invoices
for update to authenticated
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);
