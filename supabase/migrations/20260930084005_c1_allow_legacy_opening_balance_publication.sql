set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 26);

alter table public.project_cost_item_details
  drop constraint project_cost_item_details_opening_balance_legacy_check;
