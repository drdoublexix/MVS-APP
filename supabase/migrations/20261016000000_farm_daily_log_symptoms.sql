alter table public.farm_daily_logs
  add column if not exists symptoms text not null default '';
