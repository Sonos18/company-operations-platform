set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,10);

do $$
declare v_definition text;v_corrected text;
begin
  if to_regclass('public.cost_evidence_links') is null or to_regprocedure('private.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid)') is null then raise exception using errcode='P0001',message='C1_EVIDENCE_KIND_BASELINE_MISSING';end if;
  if exists(select 1 from public.cost_evidence_links where evidence_kind='source_file') then raise exception using errcode='P0001',message='C1_EVIDENCE_KIND_SOURCE_FILE_DATA_PRESENT';end if;
  select pg_get_functiondef('private.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid)'::regprocedure) into v_definition;
  v_corrected:=replace(v_definition,'''source_file''','''source_workbook''');
  if v_corrected=v_definition or v_corrected not like '%source_workbook%' then raise exception using errcode='P0001',message='C1_EVIDENCE_KIND_FUNCTION_DRIFT';end if;
  execute v_corrected;
end $$;
alter table public.cost_evidence_links drop constraint cost_evidence_links_evidence_kind_check;
alter table public.cost_evidence_links add constraint cost_evidence_links_evidence_kind_check check(evidence_kind in('contract','acceptance_record','invoice','accounting_support','payment_proof','source_workbook','other'));
revoke all on function private.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
