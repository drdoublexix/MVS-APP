create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  product_id text not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists orders_merchant_status_idx on public.orders (merchant_id, status);
create index if not exists orders_conversation_idx on public.orders (conversation_id);

alter table public.orders enable row level security;
create policy "Order participants can view orders" on public.orders for select to authenticated
using (auth.uid() = buyer_id or auth.uid() = merchant_id);
create policy "Buyers can create orders" on public.orders for insert to authenticated
with check (auth.uid() = buyer_id);
create policy "Order participants can complete orders" on public.orders for update to authenticated
using (auth.uid() = buyer_id or auth.uid() = merchant_id)
with check (auth.uid() = buyer_id or auth.uid() = merchant_id);

create or replace function public.get_merchant_metrics(merchant_uuid uuid)
returns table (total_sales numeric, active_listings bigint, pending_orders bigint)
language sql stable security definer set search_path = public
as $$
  select
    coalesce((select sum(amount) from public.orders where merchant_id = merchant_uuid and status = 'completed'), 0),
    (select count(*) from public.products where merchant_id = merchant_uuid),
    (select count(*) from public.orders where merchant_id = merchant_uuid and status = 'pending');
$$;