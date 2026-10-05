// Reviewed wrapper only: fixture validators never permit these dynamic history reads.
export const workflowRehearsalSetupSql = String.raw`
set transaction isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='90s';
set local row_security=off;
select pg_catalog.pg_advisory_xact_lock(71842,31);
do $workflow_preflight$
begin
 if pg_catalog.to_regclass('auth.users') is null
 or pg_catalog.to_regclass('storage.objects') is null
 or pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null
 then raise exception 'WORKFLOW_REHEARSAL_HISTORY_TARGET_MISSING'; end if;
 if pg_catalog.pg_get_serial_sequence('public.audit_events','id') is not null
 or pg_catalog.pg_get_serial_sequence('public.company_role_assignments','id') is not null
 then raise exception 'WORKFLOW_REHEARSAL_NONTRANSACTIONAL_SEQUENCE'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in
 ('20261004210000','20261004210100','20261004210200','20261004210300',
 '20261004210400','20261004210500','20261004210600','20261004210700'))
 then raise exception 'WORKFLOW_REHEARSAL_ALREADY_APPLIED'; end if;
end;
$workflow_preflight$;
create temporary table workflow_rehearsal_history(
 phase text not null, relation_id oid not null, columns text[] not null, fingerprint jsonb not null,
 primary key(phase,relation_id)
) on commit drop;
create function pg_temp.workflow_history_fingerprint(target oid,original_columns text[]) returns jsonb
language plpgsql set search_path='' as $workflow_fingerprint$
declare result jsonb;
begin
 execute pg_catalog.format(
  'select jsonb_build_object(''count'',count(*),''sha256'',encode(sha256(convert_to(coalesce(string_agg(h,'''' order by h),''''),''UTF8'')),''hex'')) from (
   select encode(sha256(convert_to((select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(r)) e where e.key=any($1))::text,''UTF8'')),''hex'') h
   from %s r where not exists(select 1 from jsonb_each_text(to_jsonb(r)) f where f.value ~ ''^c1f5[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'')
  ) fingerprinted_rows', target::regclass)
 into result using original_columns;
 return result;
end;
$workflow_fingerprint$;
do $workflow_fixture_namespace$
declare relation record; collision boolean;
begin
 for relation in select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in('r','p') and n.nspname in('public','private','auth','storage','supabase_migrations')
 loop
  execute pg_catalog.format('select exists(select 1 from %s r where exists(select 1 from jsonb_each_text(to_jsonb(r)) f where f.value ~ ''^c1f5[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''))',relation.oid::regclass) into collision;
  if collision then raise exception 'WORKFLOW_REHEARSAL_FIXTURE_COLLISION'; end if;
 end loop;
end;
$workflow_fixture_namespace$;
`
export function workflowHistoryCaptureSql(phase) {
 if(!['before-DDL','after-DDL'].includes(phase))throw new Error('WORKFLOW_REHEARSAL_PHASE')
 // Seven additive permission catalog definitions are the sole pre-DDL data exception.
 // Existing account grants, role assignments and every business/history row remain covered.
 const permissionFilter=phase==='before-DDL'?"and not(n.nspname='public' and c.relname='permissions')":''
 return `
do $workflow_history_capture$
declare relation record; original_columns text[];
begin
 for relation in select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in('r','p') and n.nspname in('public','private','auth','storage','supabase_migrations') ${permissionFilter}
 loop
  select array_agg(a.attname::text order by a.attnum) into original_columns from pg_catalog.pg_attribute a
   where a.attrelid=relation.oid and a.attnum>0 and not a.attisdropped;
  insert into pg_temp.workflow_rehearsal_history values('${phase}',relation.oid,original_columns,pg_temp.workflow_history_fingerprint(relation.oid,original_columns));
 end loop;
end;
$workflow_history_capture$;
`
}
export const workflowHistoryClosureSql=String.raw`
set local role none;
set local row_security=off;
do $workflow_history_closure$
declare baseline record;
begin
 for baseline in select * from pg_temp.workflow_rehearsal_history loop
  if not exists(select 1 from pg_catalog.pg_class where oid=baseline.relation_id)
   or pg_temp.workflow_history_fingerprint(baseline.relation_id,baseline.columns) is distinct from baseline.fingerprint
  then raise exception 'WORKFLOW_REHEARSAL_HISTORY_CHANGED'; end if;
 end loop;
end;
$workflow_history_closure$;
select 'C1_COST_WORKFLOW_HISTORY_CLOSED' as result;
`
