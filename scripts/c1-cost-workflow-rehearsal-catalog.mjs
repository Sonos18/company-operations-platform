import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
export const workflowAuthHelperExpressions=Object.fromEntries(['uid','role'].map(name=>{
 const claim=name==='uid'?'sub':'role',cast=name==='uid'?'::uuid':''
 return [name,[
  "select coalesce(nullif(current_setting('request.jwt.claim."+claim+"', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> '"+claim+"'))"+cast,
  "select nullif(coalesce(current_setting('request.jwt.claim."+claim+"', true), (current_setting('request.jwt.claims', true)::jsonb ->> '"+claim+"')), '')"+cast,
  "select nullif(current_setting('request.jwt.claim."+claim+"', true), '')"+cast,
 ].map(body=>body.replace(/[\s;]/g,'').toLowerCase())]
}))
export const workflowSequenceNames=['public.audit_events_id_seq','public.company_role_assignments_id_seq']
export const workflowSequenceBudgets=[[0,0],[20,4],[44,4],[56,4]]
export const workflowCumulativeBudgets=[120,12]
export const workflowTimeouts={transactionSeconds:150,statementSeconds:90,lockSeconds:5,idleSeconds:5,admissionSeconds:10}
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
export const workflowSnapshotSql=String.raw`
begin isolation level repeatable read read only;
set local transaction_timeout='15s';
set local lock_timeout='5s';
set local statement_timeout='15s';
set local idle_in_transaction_session_timeout='5s';
set local row_security=off;
set local search_path=pg_catalog,public,extensions;
create temporary table workflow_snapshot_result(value jsonb) on commit drop;
do $workflow_snapshot$
declare r record; tables jsonb='{}'; sequences jsonb='{}'; f jsonb; metadata text;
begin
 for r in select c.oid,n.nspname||'.'||c.relname name from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in('r','p','f') and n.nspname in('public','private','auth','storage','supabase_migrations') order by 2
 loop
  if exists(select 1 from pg_catalog.pg_class where oid=r.oid and relkind='f') then raise exception 'WORKFLOW_REHEARSAL_FOREIGN_TABLE';end if;
  execute format('select jsonb_build_object(''count'',count(*),''sha256'',encode(sha256(convert_to(coalesce(string_agg(h,'''' order by h),''''),''UTF8'')),''hex''),''fixture'',coalesce(bool_or(fixture),false)) from (select encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'') h,exists(select 1 from jsonb_each_text(to_jsonb(t)) v where v.value ~ ''^c1f5[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') fixture from %s t) fingerprinted_rows',r.oid::regclass) into f;
  if (f->>'fixture')::boolean then raise exception 'WORKFLOW_REHEARSAL_FIXTURE_COLLISION';end if;
  tables=tables||jsonb_build_object(r.name,f-'fixture');
 end loop;
 for r in select c.oid,n.nspname||'.'||c.relname name,s.seqincrement,s.seqcache,s.seqcycle from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_sequence s on s.seqrelid=c.oid where n.nspname in('public','private','auth','storage','supabase_migrations') order by 2
 loop
  execute format('select jsonb_build_object(''lastValue'',last_value::text,''isCalled'',is_called) from %s',r.oid::regclass) into f;
  sequences=sequences||jsonb_build_object(r.name,f||jsonb_build_object('increment',r.seqincrement::text,'cache',r.seqcache::text,'cycle',r.seqcycle));
 end loop;
 select string_agg(value,E'\n' order by value) into metadata from(
  select 'namespace:'||to_jsonb(n)::text value from pg_namespace n where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'class:'||to_jsonb(c)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'attribute:'||to_jsonb(a)::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'constraint:'||to_jsonb(c)::text from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'index:'||to_jsonb(i)::text from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'default:'||to_jsonb(d)::text from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'policy:'||to_jsonb(p)::text from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'trigger:'||to_jsonb(t)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'function:'||to_jsonb(p)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'type:'||to_jsonb(t)::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'enum:'||to_jsonb(e)::text from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'rewrite:'||to_jsonb(r)::text from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'sequence:'||to_jsonb(s)::text from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'operator:'||to_jsonb(o)::text from pg_operator o join pg_namespace n on n.oid=o.oprnamespace where n.nspname in('public','private','auth','storage','supabase_migrations','extensions')
  union all select 'default_acl:'||to_jsonb(a)::text from pg_default_acl a
  union all select 'event_trigger:'||to_jsonb(t)::text from pg_event_trigger t
  union all select 'extension:'||to_jsonb(e)::text from pg_extension e
  union all select 'dependency:'||to_jsonb(d)::text from pg_depend d where (d.classid='pg_proc'::regclass and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=d.objid and n.nspname in('public','private','auth','storage','supabase_migrations','extensions'))) or (d.classid='pg_class'::regclass and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=d.objid and n.nspname in('public','private','auth','storage','supabase_migrations','extensions'))) or (d.classid='pg_extension'::regclass)
  union all select 'role:'||to_jsonb(r)::text from pg_roles r
  union all select 'role_membership:'||to_jsonb(m)::text from pg_auth_members m
 ) catalogue;
 insert into pg_temp.workflow_snapshot_result values(jsonb_build_object('tables',tables,'sequences',sequences,'catalogueSha256',encode(sha256(convert_to(coalesce(metadata,''),'UTF8')),'hex')));
end;$workflow_snapshot$;
select value as snapshot,clock_timestamp()::text as server_time,current_database() as database,session_user as username from pg_temp.workflow_snapshot_result;
rollback;
`
export function workflowDependencyPreflightSql(inventory){
 const functions=literal(JSON.stringify(inventory.functions)),relations=literal(JSON.stringify(inventory.relations)),triggers=literal(JSON.stringify(inventory.triggers)),calls=literal(JSON.stringify(inventory.reachableFunctions||[])),authExpressions=literal(JSON.stringify(workflowAuthHelperExpressions))
 return `
do $workflow_dependencies$
declare r record; expected jsonb=${functions}::jsonb; relations jsonb=${relations}::jsonb; triggers jsonb=${triggers}::jsonb; calls jsonb=${calls}::jsonb; auth jsonb=${authExpressions}::jsonb; fn_name text; extension_name text; token record;
begin
 if current_setting('server_version_num')::integer<170000 or not exists(select 1 from pg_settings where name='transaction_timeout') then raise exception 'WORKFLOW_REHEARSAL_SERVER_TIMEOUT_UNSUPPORTED';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261004140132') then raise exception 'WORKFLOW_REHEARSAL_HR_BASELINE_MISSING';end if;
 if exists(select 1 from pg_event_trigger where evtenabled<>'D') then raise exception 'WORKFLOW_REHEARSAL_EVENT_TRIGGER_UNREVIEWED';end if;
 if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap' and n.nspname='extensions') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED';end if;
 for r in select p.*,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='auth' and p.proname in('uid','role') loop
  if r.pronargs<>0 or r.pronargdefaults<>0 or r.prosecdef or r.lanname<>'sql' or r.provolatile<>'s' or (r.proname='uid' and r.prorettype<>'uuid'::regtype) or (r.proname='role' and r.prorettype<>'text'::regtype) or exists(select 1 from unnest(r.proconfig) c where regexp_replace(replace(c,'"',''),'[[:space:]]','','g')<>'search_path=') then raise exception 'WORKFLOW_REHEARSAL_AUTH_HELPER_UNREVIEWED';end if;
  if not ((auth->r.proname) ? lower(regexp_replace(r.prosrc,'[[:space:];]','','g'))) then raise exception 'WORKFLOW_REHEARSAL_AUTH_HELPER_UNREVIEWED';end if;
 end loop;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname='uid' and p.pronargs=0) then raise exception 'WORKFLOW_REHEARSAL_AUTH_HELPER_UNREVIEWED';end if;
 for r in select p.*,n.nspname,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where calls ? (n.nspname||'.'||p.proname) loop
  select e.extname into extension_name from pg_depend d join pg_extension e on e.oid=d.refobjid where d.classid='pg_proc'::regclass and d.objid=r.oid and d.deptype='e';
  if extension_name in('pgcrypto','uuid-ossp','pgtap') then continue;end if;
  fn_name=r.nspname||'.'||r.proname;
  if r.lanname not in('sql','plpgsql') or not exists(select 1 from jsonb_array_elements(expected) e where e->>'name'=fn_name and (e->>'args')::integer=r.pronargs and (e->>'defaults')::integer=r.pronargdefaults and not exists(select 1 from generate_series(0,r.pronargs-1) idx where r.proargtypes[idx] is distinct from to_regtype(e->'types'->>idx)::oid) and r.prorettype=to_regtype(e->>'returnType')::oid and r.proretset=(e->>'returnsSet')::boolean and (e->>'definer')::boolean=r.prosecdef and e->>'language'=r.lanname and e->>'volatility'=r.provolatile and (e->>'strict')::boolean=r.proisstrict and (e->>'leakproof')::boolean=r.proleakproof and e->>'parallel'=r.proparallel and e->'config'=coalesce((select jsonb_agg(v order by v) from (select regexp_replace(replace(replace(c,chr(34),''),chr(39),''),'\\s+','','g') v from unnest(r.proconfig) c) configs),'[]'::jsonb) and e->>'sha256'=encode(sha256(convert_to(btrim(replace(replace(r.prosrc,E'\\r\\n',E'\\n'),E'\\r',E'\\n'),E' \\t\\n\\r'),'UTF8')),'hex'))
   then raise exception 'WORKFLOW_REHEARSAL_FUNCTION_UNREVIEWED';end if;
 end loop;
 for r in select t.*,n.nspname||'.'||c.relname relation_name,fn.nspname||'.'||p.proname function_name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace where not t.tgisinternal and relations ? (n.nspname||'.'||c.relname) loop
  if not exists(select 1 from jsonb_array_elements(triggers) e where e->>'key'=r.relation_name||':'||r.tgname and e->>'fn'=r.function_name and (e->>'type')::integer=r.tgtype and e->>'enabled'=r.tgenabled and (e->>'nArgs')::integer=r.tgnargs and e->>'argsHex'=encode(r.tgargs,'hex') and (e->>'whenExpression') is not distinct from case when r.tgqual is null then null else replace(regexp_replace(substring(pg_get_triggerdef(r.oid) from 'WHEN (.*) EXECUTE'),'[[:space:]()]|::text','','g'),'AND','and') end and (e->>'constraint')::boolean=(r.tgconstraint<>0) and (e->>'deferrable')::boolean=r.tgdeferrable and (e->>'initiallyDeferred')::boolean=r.tginitdeferred and e->'attributes'=coalesce((select jsonb_agg(attname order by attname) from pg_attribute where attrelid=r.tgrelid and attnum=any(r.tgattr)),'[]'::jsonb)) then raise exception 'WORKFLOW_REHEARSAL_TRIGGER_UNREVIEWED';end if;
 end loop;
 for r in select e value from jsonb_array_elements(expected) e where calls ? (e->>'name') loop
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=r.value->>'name' and p.pronargs=(r.value->>'args')::integer and not exists(select 1 from generate_series(0,p.pronargs-1) idx where p.proargtypes[idx] is distinct from to_regtype(r.value->'types'->>idx)::oid)) then raise exception 'WORKFLOW_REHEARSAL_FUNCTION_MISSING';end if;
 end loop;
 for r in select e value from jsonb_array_elements(triggers) e where to_regclass(split_part(e->>'key',':',1)) is not null loop
  if not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(split_part(r.value->>'key',':',1)) and t.tgname=split_part(r.value->>'key',':',2) and not t.tgisinternal) then raise exception 'WORKFLOW_REHEARSAL_TRIGGER_MISSING';end if;
 end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname) and c.relkind in('p','v','m','f')) or exists(select 1 from pg_inherits i join pg_class c on c.oid in(i.inhparent,i.inhrelid) join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname)) then raise exception 'WORKFLOW_REHEARSAL_RELATION_CLOSURE_UNREVIEWED';end if;
 if exists(select 1 from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname)) then raise exception 'WORKFLOW_REHEARSAL_REWRITE_UNREVIEWED';end if;
 for r in
  with recursive roots(classid,objid) as(
   select 'pg_proc'::regclass,p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where calls ? (n.nspname||'.'||p.proname)
   union select 'pg_attrdef'::regclass,a.oid from pg_attrdef a join pg_class c on c.oid=a.adrelid join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname)
   union select 'pg_constraint'::regclass,c.oid from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where relations ? (n.nspname||'.'||t.relname)
   union select 'pg_class'::regclass,i.indexrelid from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where relations ? (n.nspname||'.'||t.relname)
   union select 'pg_policy'::regclass,p.oid from pg_policy p join pg_class t on t.oid=p.polrelid join pg_namespace n on n.oid=t.relnamespace where relations ? (n.nspname||'.'||t.relname)
  ),dependencies(classid,objid) as(
   select * from roots union select d.refclassid,d.refobjid from pg_depend d join dependencies r on d.classid=r.classid and d.objid=r.objid where d.refclassid not in('pg_language'::regclass,'pg_namespace'::regclass,'pg_extension'::regclass)
  ) select distinct p.*,n.nspname,l.lanname from dependencies d join pg_proc p on d.classid='pg_proc'::regclass and p.oid=d.objid join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 loop
  fn_name=r.nspname||'.'||r.proname;
  if r.nspname='pg_catalog' and r.proname in('now','clock_timestamp','gen_random_uuid','jsonb_typeof','jsonb_array_length','array_length','cardinality','btrim','length','char_length','lower','upper','num_nonnulls') then continue;end if;
  if r.nspname='extensions' and r.proname in('digest','gen_random_uuid','uuid_generate_v4') and r.lanname='c' then continue;end if;
  if r.nspname in('public','private') and calls ? fn_name and exists(select 1 from jsonb_array_elements(expected) e where e->>'name'=fn_name) and r.prosrc !~* '\\m(execute|dblink|nextval|setval|lo_export|http|pg_read_file|pg_write_file|pg_terminate_backend|pg_cancel_backend)\\M' then continue;end if;
  if fn_name in('auth.uid','auth.role') then continue;end if;
  raise exception 'WORKFLOW_REHEARSAL_IMPLICIT_FUNCTION_UNREVIEWED';
 end loop;
 -- Reject opaque implicit function calls even when a builtin is a pinned pg_depend object.
 for r in select pg_get_expr(a.adbin,a.adrelid) expression from pg_attrdef a join pg_class c on c.oid=a.adrelid join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname)
  union all select pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='c' and relations ? (n.nspname||'.'||t.relname)
  union all select pg_get_expr(i.indexprs,i.indrelid) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where i.indexprs is not null and relations ? (n.nspname||'.'||c.relname)
  union all select pg_get_expr(i.indpred,i.indrelid) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where i.indpred is not null and relations ? (n.nspname||'.'||c.relname)
  union all select coalesce(pg_get_expr(p.polqual,p.polrelid),'')||' '||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where relations ? (n.nspname||'.'||c.relname)
 loop
  if r.expression ~* '\\m(execute|dblink|nextval|setval|lo_export|http|pg_read_file|pg_write_file|pg_terminate_backend|pg_cancel_backend)\\M' then raise exception 'WORKFLOW_REHEARSAL_IMPLICIT_EXPRESSION_UNREVIEWED';end if;
  for token in select lower(m[1]) name from regexp_matches(r.expression,'([a-z_][a-z_0-9]*(?:\\.[a-z_][a-z_0-9]*)?)[[:space:]]*\\(','gi') m loop
   if replace(token.name,'pg_catalog.','') in('check','any','all','array','row','in','not','and','or','coalesce','nullif','now','clock_timestamp','gen_random_uuid','jsonb_typeof','jsonb_array_length','array_length','cardinality','btrim','length','char_length','lower','upper','num_nonnulls','numeric','varchar','timestamp','timestamptz','character','substring','split_part','current_setting') then continue;end if;
   if token.name in('extensions.digest','extensions.gen_random_uuid','extensions.uuid_generate_v4','auth.uid') then continue;end if;
   if calls ? token.name or calls ? ('public.'||token.name) then continue;end if;
   raise exception 'WORKFLOW_REHEARSAL_IMPLICIT_EXPRESSION_UNREVIEWED';
  end loop;
 end loop;
 for r in select n.nspname||'.'||c.relname name from pg_depend d join pg_class c on c.oid=d.refobjid join pg_namespace n on n.oid=c.relnamespace join pg_attrdef a on d.classid='pg_attrdef'::regclass and a.oid=d.objid join pg_class owner on owner.oid=a.adrelid join pg_namespace ns on ns.oid=owner.relnamespace where c.relkind='S' and relations ? (ns.nspname||'.'||owner.relname) loop
  if r.name not in('public.audit_events_id_seq','public.company_role_assignments_id_seq') then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_UNREVIEWED';end if;
 end loop;
 for r in select distinct ns.nspname||'.'||s.relname name from pg_depend d join pg_class s on d.refclassid='pg_class'::regclass and s.oid=d.refobjid and s.relkind='S' join pg_namespace ns on ns.oid=s.relnamespace where
  (d.classid='pg_proc'::regclass and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=d.objid and calls ? (n.nspname||'.'||p.proname)))
  or (d.classid='pg_constraint'::regclass and exists(select 1 from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace n on n.oid=t.relnamespace where k.oid=d.objid and relations ? (n.nspname||'.'||t.relname)))
  or (d.classid='pg_class'::regclass and exists(select 1 from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where i.indexrelid=d.objid and relations ? (n.nspname||'.'||t.relname)))
 loop if r.name not in('public.audit_events_id_seq','public.company_role_assignments_id_seq') then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_UNREVIEWED';end if;end loop;
 -- Identity dependencies are stored on the sequence, rather than an attrdef.
 for r in select ns.nspname||'.'||s.relname name from pg_depend d join pg_class s on d.classid='pg_class'::regclass and s.oid=d.objid and s.relkind='S' join pg_namespace ns on ns.oid=s.relnamespace join pg_class owner on d.refclassid='pg_class'::regclass and owner.oid=d.refobjid join pg_namespace os on os.oid=owner.relnamespace where d.deptype in('i','a') and relations ? (os.nspname||'.'||owner.relname) loop
  if r.name not in('public.audit_events_id_seq','public.company_role_assignments_id_seq') then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_UNREVIEWED';end if;
 end loop;
end;$workflow_dependencies$;`
}
export function workflowAdmissionSql({nonce,serverTime,database,username}){
 if(!/^c1cw-[a-f0-9-]{36}$/.test(nonce)||!Number.isFinite(Date.parse(serverTime)))throw new Error('WORKFLOW_REHEARSAL_ADMISSION_INVALID')
 return `/*${nonce}*/\nbegin isolation level repeatable read;\nset local application_name=${literal(nonce)};
do $workflow_admission$ begin
 if current_database()<>${literal(database)} or session_user<>${literal(username)} or clock_timestamp()<${literal(serverTime)}::timestamptz or clock_timestamp()>=${literal(serverTime)}::timestamptz+interval '10 seconds' then raise exception 'WORKFLOW_REHEARSAL_ADMISSION_EXPIRED';end if;
 if current_setting('server_version_num')::integer<170000 then raise exception 'WORKFLOW_REHEARSAL_SERVER_TIMEOUT_UNSUPPORTED';end if;
end;$workflow_admission$;
set local transaction_timeout='150s';
set local statement_timeout='90s';
set local idle_in_transaction_session_timeout='5s';
set local lock_timeout='5s';
lock table public.audit_events,public.company_role_assignments in share row exclusive mode;
`
}
export function workflowSequenceGuardSql(index){
 if(!Number.isInteger(index)||index<0||index>3)throw new Error('WORKFLOW_REHEARSAL_SUITE_INDEX')
 const budgets=workflowSequenceBudgets[index]
 return `
create temporary table workflow_sequence_baseline(name text primary key,cursor numeric) on commit drop;
do $workflow_sequence_baseline$
declare n text; v bigint; called boolean; s record;
begin
 foreach n in array array['public.audit_events_id_seq','public.company_role_assignments_id_seq'] loop
  if to_regclass(n) is null or pg_get_serial_sequence(case when n='public.audit_events_id_seq' then 'public.audit_events' else 'public.company_role_assignments' end,'id')::regclass is distinct from n::regclass then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_OWNER';end if;
  select * into s from pg_sequence where seqrelid=n::regclass;
  if s.seqincrement<>1 or s.seqcache<>1 or s.seqcycle or s.seqtypid<>'bigint'::regtype then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_SETTINGS';end if;
  execute format('select last_value,is_called from %s',n::regclass) into v,called;
  if s.seqmax-v::numeric < case when n='public.audit_events_id_seq' then ${budgets[0]} else ${budgets[1]} end then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_RANGE';end if;
  if not exists(select 1 from pg_attribute where attrelid=(case when n='public.audit_events_id_seq' then 'public.audit_events' else 'public.company_role_assignments' end)::regclass and attname='id' and attidentity='a' and atttypid='bigint'::regtype) then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_OWNER';end if;
  insert into pg_temp.workflow_sequence_baseline values(n,v::numeric-case when called then 0 else 1 end);
 end loop;
end;$workflow_sequence_baseline$;
-- budgets: audit ${budgets[0]}, role assignments ${budgets[1]}
`
}
export function workflowSequenceClosureSql(index){
 const budgets=workflowSequenceBudgets[index]
 return `do $workflow_sequence_closure$
declare r record;v bigint;called boolean;delta numeric;budget integer;
begin
 for r in select * from pg_temp.workflow_sequence_baseline loop
  execute format('select last_value,is_called from %s',r.name::regclass) into v,called;
  delta=v::numeric-case when called then 0 else 1 end-r.cursor;
  budget=case when r.name='public.audit_events_id_seq' then ${budgets[0]} else ${budgets[1]} end;
  if delta<0 or delta>budget then raise exception 'WORKFLOW_REHEARSAL_SEQUENCE_BUDGET';end if;
 end loop;
end;$workflow_sequence_closure$;\n`
}
export function sequenceAllocations(before,after){
 if(!before||!after||before.increment!=='1'||after.increment!=='1'||before.cache!=='1'||after.cache!=='1'||before.cycle!==false||after.cycle!==false||typeof before.isCalled!=='boolean'||typeof after.isCalled!=='boolean'||!/^\d+$/.test(before.lastValue)||!/^\d+$/.test(after.lastValue))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_SETTINGS')
 const delta=BigInt(after.lastValue)-(after.isCalled?0n:1n)-BigInt(before.lastValue)+(before.isCalled?0n:1n)
 if(delta<0n)throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_REGRESSED')
 return delta
}
export function assertWorkflowPostflight(before,after,index,cumulative=[0n,0n]){
 if(!before||!after||before.catalogueSha256!==after.catalogueSha256||JSON.stringify(before.tables)!==JSON.stringify(after.tables))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 const keys=Object.keys(before.sequences).sort()
 if(JSON.stringify(keys)!==JSON.stringify(Object.keys(after.sequences).sort()))throw new Error('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT')
 const allocations=[0n,0n]
 for(const name of keys){
  const allowed=workflowSequenceNames.indexOf(name)
  if(allowed<0){if(JSON.stringify(before.sequences[name])!==JSON.stringify(after.sequences[name]))throw new Error('WORKFLOW_REHEARSAL_UNAPPROVED_SEQUENCE_CHANGE')}
  else{const delta=sequenceAllocations(before.sequences[name],after.sequences[name]);if(delta>BigInt(workflowSequenceBudgets[index][allowed])||cumulative[allowed]+delta>BigInt(workflowCumulativeBudgets[allowed]))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET');allocations[allowed]=delta}
 }
 if(workflowSequenceNames.some(name=>!keys.includes(name)))throw new Error('WORKFLOW_REHEARSAL_SEQUENCE_OWNER')
 return {allocations,cumulative:cumulative.map((n,i)=>n+allocations[i]),snapshotSha256:workflowSha(JSON.stringify(after))}
}
export function workflowBackendCensusSql({nonce,database,username}){
 if(!/^c1cw-[a-f0-9-]{36}$/.test(nonce))throw new Error('WORKFLOW_REHEARSAL_OWNER_INVALID')
 return `select clock_timestamp()::text as server_time,coalesce(jsonb_agg(jsonb_build_object('pid',pid,'backendStart',backend_start::text,'database',datname,'username',usename,'applicationName',application_name,'query',query,'transactionStart',xact_start::text)) ,'[]'::jsonb) as backends from pg_stat_activity where (application_name=${literal(nonce)} or left(query,${nonce.length+4})=${literal('/*'+nonce+'*/')}) and datname=${literal(database)} and usename=${literal(username)};`
}
export function assertOwnedWorkflowBackend(backend,owner){
 if(!backend||!Number.isInteger(backend.pid)||backend.pid<=0||!Number.isFinite(Date.parse(backend.backendStart))||backend.database!==owner.database||backend.username!==owner.username||backend.applicationName!==owner.nonce||!String(backend.query).startsWith('/*'+owner.nonce+'*/')||!backend.transactionStart)throw new Error('WORKFLOW_REHEARSAL_FOREIGN_BACKEND')
 return backend
}
export function workflowTerminateSql(backend,owner){
 assertOwnedWorkflowBackend(backend,owner)
 return `select pg_terminate_backend(pid,5000) as terminated from pg_stat_activity where pid=${backend.pid} and backend_start=${literal(backend.backendStart)}::timestamptz and datname=${literal(owner.database)} and usename=${literal(owner.username)} and application_name=${literal(owner.nonce)} and left(query,${owner.nonce.length+4})=${literal('/*'+owner.nonce+'*/')} and xact_start is not null;`
}
