create table if not exists public.vet_service_pricing (
  vet_id uuid primary key references public.profiles(id) on delete cascade,
  service_prices jsonb not null default '{}'::jsonb,
  bundle_prices jsonb not null default '{}'::jsonb,
  care_plan_prices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vet_service_pricing enable row level security;

drop policy if exists "Authenticated users can view vet service pricing"
  on public.vet_service_pricing;
create policy "Authenticated users can view vet service pricing"
  on public.vet_service_pricing
  for select
  to authenticated
  using (true);

drop policy if exists "Vets can insert their own service pricing"
  on public.vet_service_pricing;
create policy "Vets can insert their own service pricing"
  on public.vet_service_pricing
  for insert
  to authenticated
  with check (vet_id = (select auth.uid()));

drop policy if exists "Vets can update their own service pricing"
  on public.vet_service_pricing;
create policy "Vets can update their own service pricing"
  on public.vet_service_pricing
  for update
  to authenticated
  using (vet_id = (select auth.uid()))
  with check (vet_id = (select auth.uid()));

drop policy if exists "Vets can delete their own service pricing"
  on public.vet_service_pricing;
create policy "Vets can delete their own service pricing"
  on public.vet_service_pricing
  for delete
  to authenticated
  using (vet_id = (select auth.uid()));
