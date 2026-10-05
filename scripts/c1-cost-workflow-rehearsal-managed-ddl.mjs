// Reviewed read-only-managed-ddl.json, 2026-10-05. Changes require new source review.
// PostgREST NOTIFY delivery is canceled by rollback. Exact extension-name predicates
// in the three CREATE EXTENSION hooks are inert for pgtap; DROP EXTENSION is excluded.
export const workflowManagedDdlHandlers=Object.freeze([
 {name:'issue_graphql_placeholder',event:'sql_drop',tags:['DROP EXTENSION'],enabled:'O',function:'extensions.set_graphql_placeholder',sha256:'80e0c97f0a475697c1b517e0d27887bfa0c2baf138229735a58a345d2168505b'},
 {name:'pgrst_ddl_watch',event:'ddl_command_end',tags:null,enabled:'O',function:'extensions.pgrst_ddl_watch',sha256:'de987df746eb39647098459e7993bd8595e592969b0cd647828a3d13d37cffe0'},
 {name:'pgrst_drop_watch',event:'sql_drop',tags:null,enabled:'O',function:'extensions.pgrst_drop_watch',sha256:'791b41f0632fc86e0fc86a303ec0fd710c4e2ecf947a23422dae2b7a2c122f1d'},
 {name:'issue_pg_cron_access',event:'ddl_command_end',tags:['CREATE EXTENSION'],enabled:'O',function:'extensions.grant_pg_cron_access',sha256:'00db212b76cecd4b0794b2f20c414ab4988d675959747cd12d3eb4c6d6736f38'},
 {name:'issue_pg_net_access',event:'ddl_command_end',tags:['CREATE EXTENSION'],enabled:'O',function:'extensions.grant_pg_net_access',sha256:'754e58111dbe32030af4d91591dfd78cb3cf8e8f4f56a5fcc199bb0cf7f4ac2b'},
 {name:'issue_pg_graphql_access',event:'ddl_command_end',tags:['CREATE EXTENSION'],enabled:'O',function:'extensions.grant_pg_graphql_access',sha256:'03de03bb70da1d448f7a674215d1b63a924dc7115db657dae34b1aa8977e030e'},
].map(handler=>Object.freeze({...handler,language:'plpgsql',securityDefiner:false,config:['search_path=""'],volatility:'v',args:0,returnType:'event_trigger',returnsSet:false})))

export const workflowManagedDdlGuardSql=`
 if coalesce((select jsonb_agg(jsonb_build_object(
  'name',e.evtname,'event',e.evtevent,'tags',e.evttags,'enabled',e.evtenabled,
  'function',n.nspname||'.'||p.proname,'sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
  'language',l.lanname,'securityDefiner',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,
  'args',p.pronargs,'returnType',p.prorettype::regtype::text,'returnsSet',p.proretset
 ) order by e.evtname) from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
 join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang),'[]'::jsonb)
 is distinct from '${JSON.stringify([...workflowManagedDdlHandlers].sort((a,b)=>a.name.localeCompare(b.name))).replaceAll("'","''")}'::jsonb
 then raise exception 'WORKFLOW_REHEARSAL_MANAGED_DDL_CHANGED';end if;
`
