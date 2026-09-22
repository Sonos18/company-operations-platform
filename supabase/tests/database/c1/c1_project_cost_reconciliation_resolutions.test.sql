begin;

do $$
begin
  if to_regclass('public.project_cost_reconciliation_resolutions') is null then
    raise exception 'C1_RECONCILIATION_TABLE_MISSING';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='project_cost_reconciliation_resolutions'
      and policyname='c1_finance_read'
      and cmd='SELECT'
  ) then
    raise exception 'C1_RECONCILIATION_SELECT_POLICY_MISSING';
  end if;
  if not pg_catalog.has_table_privilege('authenticated','public.project_cost_reconciliation_resolutions','select') then
    raise exception 'C1_RECONCILIATION_AUTHENTICATED_SELECT_MISSING';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.project_cost_reconciliation_resolutions','insert')
     or pg_catalog.has_table_privilege('authenticated','public.project_cost_reconciliation_resolutions','update')
     or pg_catalog.has_table_privilege('authenticated','public.project_cost_reconciliation_resolutions','delete') then
    raise exception 'C1_RECONCILIATION_AUTHENTICATED_WRITE_EXPOSED';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='project_cost_reconciliation_resolutions'
      and t.tgname='a_c1_finance_prepare' and not t.tgisinternal
  ) or not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='project_cost_reconciliation_resolutions'
      and t.tgname='z_c1_finance_audit' and not t.tgisinternal
  ) then
    raise exception 'C1_RECONCILIATION_AUDIT_TRIGGERS_MISSING';
  end if;
end $$;

rollback;
