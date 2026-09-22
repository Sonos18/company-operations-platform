set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,9);

do $$ begin
  if to_regclass('public.cost_evidence_files') is null or not exists(select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_files' and policyname='c1_cost_evidence_files_select') then raise exception using errcode='P0001',message='C1_EVIDENCE_RLS_INITPLAN_BASELINE_MISSING'; end if;
end $$;
drop policy c1_cost_evidence_files_select on public.cost_evidence_files;
create policy c1_cost_evidence_files_select on public.cost_evidence_files for select to authenticated using(
  (status='pending_upload' and created_by=(select auth.uid()) and private.has_company_permission(tenant_id,company_id,'cost.prepare'))
  or (status='finalized' and (private.has_company_permission(tenant_id,company_id,'cost.source.read') or private.has_company_permission(tenant_id,company_id,'cost.file.read')))
);
notify pgrst,'reload schema';
