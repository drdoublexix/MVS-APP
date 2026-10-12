create table if not exists public.farm_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  batch_name text not null check (length(trim(batch_name)) > 0),
  species text not null check (species in ('Broilers', 'Layers', 'Fish', 'Pigs', 'Swine', 'Goats', 'Cattle')),
  initial_head_count integer not null check (initial_head_count > 0),
  start_date date not null default current_date,
  initial_cost numeric(12, 2) not null default 0 check (initial_cost >= 0),
  feed_cost_per_kg numeric(12, 2) not null default 0 check (feed_cost_per_kg >= 0),
  initial_avg_weight_g numeric(12, 2) check (initial_avg_weight_g is null or initial_avg_weight_g >= 0),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists farm_batches_owner_status_idx
  on public.farm_batches (owner_id, status, start_date desc);

alter table public.farm_batches enable row level security;

drop policy if exists "Farmers can view their production batches" on public.farm_batches;
create policy "Farmers can view their production batches"
  on public.farm_batches for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Farmers can create their production batches" on public.farm_batches;
create policy "Farmers can create their production batches"
  on public.farm_batches for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Farmers can update their production batches" on public.farm_batches;
create policy "Farmers can update their production batches"
  on public.farm_batches for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Farmers can delete their production batches" on public.farm_batches;
create policy "Farmers can delete their production batches"
  on public.farm_batches for delete to authenticated
  using (owner_id = auth.uid());

create table if not exists public.farm_daily_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.farm_batches(id) on delete cascade,
  log_date date not null,
  feed_consumed_kg numeric(12, 3) not null default 0 check (feed_consumed_kg >= 0),
  mortality_count integer not null default 0 check (mortality_count >= 0),
  average_weight_g numeric(12, 2) check (average_weight_g is null or average_weight_g >= 0),
  weight_gain_g numeric(14, 2) not null default 0 check (weight_gain_g >= 0),
  expense_amount numeric(12, 2) not null default 0 check (expense_amount >= 0),
  revenue_amount numeric(12, 2) not null default 0 check (revenue_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, log_date)
);

create index if not exists farm_daily_logs_batch_date_idx
  on public.farm_daily_logs (batch_id, log_date desc);

alter table public.farm_daily_logs enable row level security;

drop policy if exists "Farmers can view their batch daily logs" on public.farm_daily_logs;
create policy "Farmers can view their batch daily logs"
  on public.farm_daily_logs for select to authenticated
  using (
    exists (
      select 1 from public.farm_batches
      where farm_batches.id = farm_daily_logs.batch_id
        and farm_batches.owner_id = auth.uid()
    )
  );

drop policy if exists "Farmers can create their batch daily logs" on public.farm_daily_logs;
create policy "Farmers can create their batch daily logs"
  on public.farm_daily_logs for insert to authenticated
  with check (
    exists (
      select 1 from public.farm_batches
      where farm_batches.id = farm_daily_logs.batch_id
        and farm_batches.owner_id = auth.uid()
    )
  );

drop policy if exists "Farmers can update their batch daily logs" on public.farm_daily_logs;
create policy "Farmers can update their batch daily logs"
  on public.farm_daily_logs for update to authenticated
  using (
    exists (
      select 1 from public.farm_batches
      where farm_batches.id = farm_daily_logs.batch_id
        and farm_batches.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.farm_batches
      where farm_batches.id = farm_daily_logs.batch_id
        and farm_batches.owner_id = auth.uid()
    )
  );

drop policy if exists "Farmers can delete their batch daily logs" on public.farm_daily_logs;
create policy "Farmers can delete their batch daily logs"
  on public.farm_daily_logs for delete to authenticated
  using (
    exists (
      select 1 from public.farm_batches
      where farm_batches.id = farm_daily_logs.batch_id
        and farm_batches.owner_id = auth.uid()
    )
  );

create or replace function public.validate_farm_batch_mortality()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  batch_head_count integer;
  other_mortality integer;
  excluded_log_id uuid;
begin
  select initial_head_count
    into batch_head_count
    from public.farm_batches
    where id = new.batch_id
    for update;

  if batch_head_count is null then
    raise exception 'Farm batch not found.';
  end if;

  excluded_log_id := case when tg_op = 'UPDATE' then old.id else null end;

  select coalesce(sum(mortality_count), 0)
    into other_mortality
    from public.farm_daily_logs
    where batch_id = new.batch_id
      and id is distinct from excluded_log_id;

  if other_mortality + new.mortality_count > batch_head_count then
    raise exception 'Total mortality cannot exceed the batch initial head count.';
  end if;

  return new;
end;
$$;

drop trigger if exists farm_daily_logs_validate_mortality on public.farm_daily_logs;
create trigger farm_daily_logs_validate_mortality
  before insert or update of batch_id, mortality_count on public.farm_daily_logs
  for each row execute function public.validate_farm_batch_mortality();

create or replace function public.recalculate_farm_batch_weight_gains(batch_uuid uuid)
returns void
language sql
set search_path = public
as $$
  update public.farm_daily_logs as daily
  set weight_gain_g = case
    when daily.average_weight_g is null then 0
    when coalesce(
      (
        select previous.average_weight_g
        from public.farm_daily_logs as previous
        where previous.batch_id = daily.batch_id
          and previous.log_date < daily.log_date
          and previous.average_weight_g is not null
        order by previous.log_date desc
        limit 1
      ),
      batch.initial_avg_weight_g
    ) is null then 0
    else greatest(
      0,
      (
        daily.average_weight_g - coalesce(
          (
            select previous.average_weight_g
            from public.farm_daily_logs as previous
            where previous.batch_id = daily.batch_id
              and previous.log_date < daily.log_date
              and previous.average_weight_g is not null
            order by previous.log_date desc
            limit 1
          ),
          batch.initial_avg_weight_g
        )
      ) * greatest(
        0,
        batch.initial_head_count - coalesce(
          (
            select sum(logs.mortality_count)
            from public.farm_daily_logs as logs
            where logs.batch_id = daily.batch_id
              and logs.log_date <= daily.log_date
          ),
          0
        )
      )
    )
  end
  from public.farm_batches as batch
  where batch.id = batch_uuid
    and daily.batch_id = batch_uuid;
$$;

create or replace function public.refresh_farm_batch_weight_gains()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.recalculate_farm_batch_weight_gains(old.batch_id);
  elsif tg_op = 'UPDATE' then
    if old.batch_id is distinct from new.batch_id then
      perform public.recalculate_farm_batch_weight_gains(old.batch_id);
    end if;
    perform public.recalculate_farm_batch_weight_gains(new.batch_id);
  else
    perform public.recalculate_farm_batch_weight_gains(new.batch_id);
  end if;

  return null;
end;
$$;

drop trigger if exists farm_daily_logs_refresh_weight_gains on public.farm_daily_logs;
create trigger farm_daily_logs_refresh_weight_gains
  after insert or update or delete on public.farm_daily_logs
  for each row execute function public.refresh_farm_batch_weight_gains();
