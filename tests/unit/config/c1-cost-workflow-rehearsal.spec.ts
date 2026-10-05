import {describe,expect,it,vi} from 'vitest'
import {costWorkflowSqlFiles} from '../../../scripts/run-c1-cost-workflow-tests.mjs'
import {reviewWorkflowRehearsal,runWorkflowRehearsal,costWorkflowMigrationFiles,costWorkflowAssertionCounts,closeOwnedWorkflowBackend} from '../../../scripts/run-c1-cost-workflow-rehearsal.mjs'
import {workflowSequenceNames,sequenceAllocations,assertWorkflowPostflight,workflowAdmissionSql,workflowTerminateSql,workflowDependencyPreflightSql,workflowBackendCensusSql,workflowAuthHelperExpressions} from '../../../scripts/c1-cost-workflow-rehearsal-catalog.mjs'
import {workflowFunctionInventory,workflowDependencyInventory,readWorkflowBaseMigrations} from '../../../scripts/c1-cost-workflow-rehearsal-inventory.mjs'
vi.mock('../../../scripts/run-supabase-dev.mjs',()=>({isolatedSupabaseEnvironment:vi.fn(()=>({}))}))
const sql="set local lock_timeout='5s'; select 1;"
const fixture=()=>({migrations:costWorkflowMigrationFiles.map(name=>({name,sql})),suites:costWorkflowSqlFiles.map((name,i)=>({name,sql:"begin; select plan("+costWorkflowAssertionCounts[i]+"); select * from finish(); rollback;"}))})
const counter=(lastValue='1',isCalled=false)=>({lastValue,isCalled,increment:'1',cache:'1',cycle:false})
const snapshot=(audit='1',roles='1',called=false)=>({tables:{'public.history':{count:1,sha256:'b'.repeat(64)}},catalogueSha256:'a'.repeat(64),sequences:{[workflowSequenceNames[0]!]:counter(audit,called),[workflowSequenceNames[1]!]:counter(roles,called),'public.workflow_node_events_id_seq':counter()}})
const owner={nonce:'c1cw-11111111-1111-4111-8111-111111111111',serverTime:'2026-10-05T00:00:00Z',database:'postgres',username:'postgres'}
const backend={pid:41,backendStart:'2026-10-05T00:00:01Z',database:owner.database,username:owner.username,applicationName:owner.nonce,query:'/*'+owner.nonce+'*/begin;',transactionStart:'2026-10-05T00:00:01Z'}
function harness(change?:(sql:string,response:{rows:Record<string,unknown>[]})=>{rows:Record<string,unknown>[]}){
 let batches=0,audit=0,roles=0,time=Date.parse(owner.serverTime)
 const lease={assertHeld:vi.fn(),release:vi.fn(async()=>{})}
 const query=vi.fn(async(sql:string)=>{
  let response:{rows:Record<string,unknown>[]}
  if(sql.includes('workflow_snapshot_result')){
   response={rows:[{snapshot:snapshot(String(audit||1),String(roles||1),audit>0),server_time:new Date(time).toISOString(),database:'postgres',username:'postgres'}]}
  }else if(sql.startsWith('/*c1cw-')){
   expect(sql).toContain("begin isolation level repeatable read;")
   expect(sql).toContain("set local transaction_timeout='150s'")
   expect(sql).toContain("in share row exclusive mode")
   expect(sql).toContain('WORKFLOW_REHEARSAL_SEQUENCE_BUDGET')
   expect(sql).toContain('WORKFLOW_REHEARSAL_FIXTURE_COLLISION')
   expect(sql.indexOf('set local row_security=on')).toBeLessThan(sql.indexOf('select plan('))
   expect(sql).toContain("rollback;\nselect 'C1_COST_WORKFLOW_ROLLBACK_CONFIRMED'")
   const count=costWorkflowAssertionCounts[batches]!
   const allocations=[[0,0],[20,4],[24,4],[26,4]][batches++]!
   audit+=allocations[0]!;roles+=allocations[1]!
   response={rows:[{plan:'1..'+count},...Array.from({length:count},(_,j)=>({ok:'ok '+(j+1)+' - synthetic'})),{result:'C1_COST_WORKFLOW_HISTORY_CLOSED'},{result:'C1_COST_WORKFLOW_ROLLBACK_CONFIRMED',no_write_transaction:true}]}
  }else if(sql.includes('pg_stat_activity')){time+=11000;response={rows:[{server_time:new Date(time).toISOString(),backends:[]}]}}
  else response={rows:[]}
  return change?change(sql,response):response
 })
 return {query,lease,acquireLock:vi.fn(async()=>lease),batches:()=>batches}
}
async function execute(h:ReturnType<typeof harness>){
 const f=fixture(),hash=reviewWorkflowRehearsal(f).manifestSha256
 return runWorkflowRehearsal({...f,execute:true,confirmation:hash,authorization:hash,assertTarget:vi.fn(),query:h.query,acquireLock:h.acquireLock,delay:vi.fn(async()=>{}),nonceFactory:()=>owner.nonce})
}
describe('exact cost workflow rollback rehearsal preparation',()=>{
 it('previews execution closure, runtime and bounded sequence exception with no target/database/lock lookup',async()=>{const assertTarget=vi.fn(),query=vi.fn(),acquireLock=vi.fn();const result=await runWorkflowRehearsal({...fixture(),assertTarget,query,acquireLock});expect(result.mode).toBe('preview');expect(result.migrations).toHaveLength(8);expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);expect(result.executionSources.some((s:{name:string})=>s.name==='scripts/assert-cloud-dev-target.mjs')).toBe(true);expect(result.executionSources.some((s:{name:string})=>s.name==='scripts/run-supabase-dev.mjs')).toBe(true);expect(result.sequenceException.total).toEqual([120,12]);expect(result.runtime.cliVersion).toBe('2.114.0');expect(assertTarget).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(acquireLock).not.toHaveBeenCalled()})
 it('rejects missing migration names and confirms source bytes',()=>{const f=fixture();expect(()=>reviewWorkflowRehearsal({...f,migrations:f.migrations.slice(1)})).toThrow('WORKFLOW_REHEARSAL_MIGRATION_SET');const a=reviewWorkflowRehearsal(f);f.migrations[0]!.sql+=' select 2;';expect(reviewWorkflowRehearsal(f).manifestSha256).not.toBe(a.manifestSha256)})
 it('requires both authorizations before target/network/lock',async()=>{const assertTarget=vi.fn(),query=vi.fn(),acquireLock=vi.fn();await expect(runWorkflowRehearsal({...fixture(),execute:true,confirmation:'wrong',authorization:'wrong',assertTarget,query,acquireLock})).rejects.toThrow('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED');expect(assertTarget).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(acquireLock).not.toHaveBeenCalled()})
 it('checks DEV before acquiring a lock or querying',async()=>{const f=fixture(),hash=reviewWorkflowRehearsal(f).manifestSha256,query=vi.fn(),acquireLock=vi.fn();await expect(runWorkflowRehearsal({...f,execute:true,confirmation:hash,authorization:hash,assertTarget:()=>{throw new Error('WRONG_TARGET')},query,acquireLock})).rejects.toThrow('WRONG_TARGET');expect(query).not.toHaveBeenCalled();expect(acquireLock).not.toHaveBeenCalled()})
 it('rejects transaction controls and destructive or foreign fixtures',()=>{const f=fixture();f.migrations[0]!.sql+=' commit;';expect(()=>reviewWorkflowRehearsal(f)).toThrow();const g=fixture();g.suites[0]!.sql='begin; delete from public.tenants; rollback;';expect(()=>reviewWorkflowRehearsal(g)).toThrow('UNSAFE_WORKFLOW_SQL')})
 it('rejects reordered suites or changed plans',()=>{const f=fixture();f.suites.reverse();expect(()=>reviewWorkflowRehearsal(f)).toThrow('WORKFLOW_REHEARSAL_TEST_SET');const g=fixture();g.suites[0]!.sql=g.suites[0]!.sql.replace('plan(80)','plan(1)');expect(()=>reviewWorkflowRehearsal(g)).toThrow('WORKFLOW_REHEARSAL_PLAN')})
 it('holds one lease through four exact suites, confirmed rollback and fresh snapshots',async()=>{const h=harness();const result=await execute(h);expect(h.batches()).toBe(4);expect(result.receipts.map((r:{assertions:number})=>r.assertions)).toEqual([80,13,28,22]);expect(result.sequenceAllocations).toEqual(['70','12']);expect(h.acquireLock).toHaveBeenCalledTimes(1);expect(h.lease.release).toHaveBeenCalledTimes(1)})
 it.each(['WORKFLOW_REHEARSAL_SERVER_TIMEOUT_UNSUPPORTED','WORKFLOW_REHEARSAL_EVENT_TRIGGER_UNREVIEWED','WORKFLOW_REHEARSAL_FUNCTION_UNREVIEWED'])('blocks before fixture execution when preflight reports %s',async(code)=>{const h=harness((sql,response)=>{if(sql.includes('workflow_dependencies')&&!sql.startsWith('/*'))throw new Error(code);return response});await expect(execute(h)).rejects.toThrow(code);expect(h.batches()).toBe(0);expect(h.lease.release).toHaveBeenCalledTimes(1)})
 it('postflights malformed/failed executions and prevents the next suite',async()=>{const h=harness((sql,response)=>sql.startsWith('/*')?{rows:response.rows.filter(r=>r.result!=='C1_COST_WORKFLOW_ROLLBACK_CONFIRMED')}:response);await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_RESULT_INVALID');expect(h.batches()).toBe(1);expect(h.query.mock.calls.filter(([s])=>s.includes('workflow_snapshot_result'))).toHaveLength(2);expect(h.lease.release).toHaveBeenCalledTimes(1)})
 it('postflights CLI timeout and prevents replay',async()=>{const h=harness((sql,response)=>{if(sql.startsWith('/*'))throw new Error('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT');return response});await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT');expect(h.batches()).toBe(1);expect(h.query.mock.calls.filter(([s])=>s.includes('workflow_snapshot_result'))).toHaveLength(2)})
 it('stops on fresh catalogue drift',async()=>{let snapshots=0;const h=harness((sql,response)=>{if(sql.includes('workflow_snapshot_result')&&++snapshots===2)(response.rows[0]!.snapshot as ReturnType<typeof snapshot>).catalogueSha256='c'.repeat(64);return response});await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT');expect(h.batches()).toBe(1)})
})
describe('sequence exception and backend ownership',()=>{
 it('counts first nextval and bigint allocations without precision loss',()=>{expect(sequenceAllocations(counter(),counter('1',true))).toBe(1n);expect(sequenceAllocations(counter('9007199254740993',true),counter('9007199254740995',true))).toBe(2n)})
 it('rejects counter regression, non-unit/cache settings and security-suite allocations',()=>{expect(()=>sequenceAllocations(counter('5',true),counter('4',true))).toThrow('REGRESSED');expect(()=>sequenceAllocations({...counter(),cache:'2'},counter())).toThrow('SETTINGS');expect(()=>assertWorkflowPostflight(snapshot(),snapshot('1','1',true),0)).toThrow('BUDGET')})
 it('rejects cumulative bounds and all other persistent sequence changes',()=>{expect(()=>assertWorkflowPostflight(snapshot(),snapshot('20','4',true),1,[110n,10n])).toThrow('BUDGET');const after=snapshot();after.sequences['public.workflow_node_events_id_seq']!.isCalled=true;expect(()=>assertWorkflowPostflight(snapshot(),after,0)).toThrow('UNAPPROVED_SEQUENCE_CHANGE')})
 it('uses fresh server time and an early query tag for admission and requires PG17',()=>{const sql=workflowAdmissionSql(owner);expect(sql.startsWith('/*'+owner.nonce+'*/')).toBe(true);expect(sql).toContain('clock_timestamp()');expect(sql).toContain("interval '10 seconds'");expect(sql).toContain('<170000');expect(()=>workflowAdmissionSql({...owner,serverTime:'invalid'})).toThrow('ADMISSION_INVALID')})
 it('terminates only an exact owned identity; refuses foreign users, changed tags and PID reuse',()=>{const sql=workflowTerminateSql(backend,owner);expect(sql).toContain('pid=41');expect(sql).toContain("backend_start='2026-10-05T00:00:01Z'");expect(sql).toContain("application_name='"+owner.nonce+"'");expect(()=>workflowTerminateSql({...backend,username:'other'},owner)).toThrow('FOREIGN_BACKEND');expect(()=>workflowTerminateSql({...backend,query:'select 1'},owner)).toThrow('FOREIGN_BACKEND')})
 it('waits past admission expiry rather than trusting an early empty census',async()=>{let calls=0;const delay=vi.fn(async()=>{}),query=vi.fn(async()=>({rows:[{server_time:++calls===1?'2026-10-05T00:00:05Z':'2026-10-05T00:00:11Z',backends:[]}]}));await expect(closeOwnedWorkflowBackend({query,owner,delay})).resolves.toEqual({admissionExpired:true,ownedTransactionAbsent:true});expect(query).toHaveBeenCalledTimes(2);expect(delay).toHaveBeenCalledTimes(1)})
 it('confirms disappearance after termination and rejects unsuccessful termination',async()=>{let censuses=0;const query=vi.fn(async(sql:string)=>sql.includes('pg_terminate_backend')?{rows:[{terminated:true}]}:{rows:[{server_time:'2026-10-05T00:00:11Z',backends:++censuses===1?[backend]:[]}]});await closeOwnedWorkflowBackend({query,owner,delay:vi.fn(async()=>{})});expect(censuses).toBe(2);const failed=vi.fn(async(sql:string)=>sql.includes('pg_terminate_backend')?{rows:[{terminated:false}]}:{rows:[{server_time:'2026-10-05T00:00:11Z',backends:[backend]}]});await expect(closeOwnedWorkflowBackend({query:failed,owner,delay:vi.fn(async()=>{})})).rejects.toThrow('TERMINATION_FAILED')})
 it('permits a pooled idle backend only after its transaction is absent',async()=>{const query=vi.fn(async()=>({rows:[{server_time:'2026-10-05T00:00:11Z',backends:[{...backend,applicationName:'',transactionStart:null}]}]}));await expect(closeOwnedWorkflowBackend({query,owner})).resolves.toBeDefined();expect(query).toHaveBeenCalledTimes(1)})
 it('rejects unverifiable census and foreign ownership without termination',async()=>{const query=vi.fn(async()=>({rows:[{server_time:'2026-10-05T00:00:11Z',backends:[{...backend,username:'other'}]}]}));await expect(closeOwnedWorkflowBackend({query,owner})).rejects.toThrow('FOREIGN_BACKEND');expect(query).toHaveBeenCalledTimes(1)})
 it('catalogue preflight includes timeout, event-trigger, full function/default/identity boundaries',()=>{const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]});for(const guard of ['transaction_timeout','pg_event_trigger','pg_proc','prosecdef','proconfig','pg_trigger','pg_attrdef','pg_depend','PGTAP_NOT_INSTALLED'])expect(sql).toContain(guard)})
})
describe('source dependency inventory',()=>{
 it('follows multiline triggers and literal qualified PL/pgSQL references instead of pg_depend alone',()=>{const baseMigrations=[{name:'base.sql',sql:"create function private.audit() returns trigger language plpgsql as $$begin insert into public.audit_events default values;return new;end$$; create trigger audit_role\nafter insert\non public.roles\nfor each row execute function private.audit();"}];const result=workflowDependencyInventory({baseMigrations,migrations:[],suites:[{name:'test.sql',sql:'insert into public.roles values(1);'}]});expect(result.relations).toContain('public.audit_events');expect(result.reachableFunctions).toContain('private.audit');expect(result.triggers).toMatchObject([{key:'public.roles:audit_role',fn:'private.audit',type:5,enabled:'O',nArgs:0}])})
 it('freezes latest bodies/configuration and refuses dynamic reachable dependencies',()=>{const source="create function private.f(input uuid default null) returns uuid language sql stable security definer set search_path='' as $$select input$$;";const f=workflowFunctionInventory([{sql:source}]);expect(f[0]).toMatchObject({name:'private.f',args:1,language:'sql',volatility:'s',definer:true,config:['search_path=']});expect(()=>workflowDependencyInventory({baseMigrations:[{sql:"create function private.f() returns void language plpgsql as $$begin execute 'select 1';end$$;"}],migrations:[],suites:[{sql:'select private.f();'}]})).toThrow('DYNAMIC_DEPENDENCY')})
})

describe('ordered catalogue and quiet-window regression guards',()=>{
 it.each(['history','catalogue','sequence'])('rejects %s changes committed between suites',async(kind)=>{
  let seen=0;const h=harness((sql,response)=>{if(sql.includes('workflow_snapshot_result')&&++seen===3){const s=response.rows[0]!.snapshot as ReturnType<typeof snapshot>;if(kind==='history')s.tables['public.history']!.count++;else if(kind==='catalogue')s.catalogueSha256='c'.repeat(64);else s.sequences['public.workflow_node_events_id_seq']!.isCalled=true}return response})
  await expect(execute(h)).rejects.toThrow(kind==='sequence'?'UNAPPROVED_SEQUENCE_CHANGE':'POSTFLIGHT_DRIFT');expect(h.batches()).toBe(1)
 })
 it('replays function config, rename, replacement and retirement in source order',()=>{
  const result=workflowFunctionInventory([{sql:"create function private.f(value text) returns text language sql as $$select value$$; alter function private.f(text) set search_path=''; alter function private.f(text) rename to f_legacy; create function private.f(value text) returns text language sql as $$select upper(value)$$; drop function private.f(text);"}])
  expect(result).toHaveLength(1);expect(result[0]).toMatchObject({name:'private.f_legacy',types:['text'],returnType:'text',config:['search_path='],body:'select value'})
 })
 it('retains trigger timing, events, arguments and a simple WHEN equality',()=>{
  const source="create function private.f() returns trigger language plpgsql as $$begin return new;end$$; create trigger event_guard before update or delete on public.events for each row when (old.kind = 'invoice') execute function private.f('one');"
  const result=workflowDependencyInventory({baseMigrations:[{sql:source}],migrations:[],suites:[{sql:'insert into public.events values(1);'}]})
  expect(result.triggers[0]).toMatchObject({type:27,nArgs:1,argsHex:'6f6e6500',enabled:'O',whenExpression:"old.kind='invoice'"})
 })
 it('requires signature/return/config, immutable trigger semantics and implicit-function boundaries',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[],reachableFunctions:[]})
  for(const requirement of ['proargtypes','pronargdefaults','prorettype','proretset','tgtype','tgnargs','tgargs','tgqual','tgdeferrable','IMPLICIT_FUNCTION_UNREVIEWED','IMPLICIT_EXPRESSION_UNREVIEWED','HR_BASELINE_MISSING','AUTH_HELPER_UNREVIEWED'])expect(sql).toContain(requirement)
 })
})

describe('bounded implicit dependency regression boundaries',()=>{
 it.each(["nextval(current_setting('app.sequence')::regclass)","setval('public.unapproved'::regclass,1)"])('rejects reachable source allocation outside the approved identities: %s',expression=>{
  expect(()=>workflowDependencyInventory({baseMigrations:[{sql:"create function private.dynamic_sequence() returns bigint language sql as $$select "+expression+"$$;"}],migrations:[],suites:[{sql:'select private.dynamic_sequence();'}]})).toThrow('DYNAMIC_DEPENDENCY')
 })
 it('emits fail-closed implicit nextval, rewrite/inheritance and expected presence controls',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[],reachableFunctions:[]})
  expect(sql).toContain('execute|dblink|nextval|setval')
  for(const boundary of ['pg_rewrite','pg_inherits','inhrelid','inhparent','FUNCTION_MISSING','TRIGGER_MISSING'])expect(sql).toContain(boundary)
 })
})

describe('reviewed dependency and cleanup evidence boundaries',()=>{
 it('excludes implementation ownership edges while preserving executable roots',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[],reachableFunctions:[]})
  expect(sql).toContain("d.refclassid not in('pg_language'::regclass,'pg_namespace'::regclass,'pg_extension'::regclass)")
  expect(sql).toContain("d.classid='pg_proc'::regclass")
 })
 it('reports primary failure together with uncertain cleanup and failed fresh history verification',async()=>{
  const h=harness((sql,response)=>{
   if(sql.startsWith('/*'))throw new Error('WORKFLOW_REHEARSAL_CLIENT_TIMEOUT')
   if(sql.includes('pg_stat_activity'))throw new Error('WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN')
   if(sql.includes('workflow_snapshot_result')&&h.batches()>0)(response.rows[0]!.snapshot as ReturnType<typeof snapshot>).catalogueSha256='c'.repeat(64)
   return response
  })
  await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_FAILURES:{"primary":"WORKFLOW_REHEARSAL_CLIENT_TIMEOUT","cleanup":"WORKFLOW_REHEARSAL_CLEANUP_UNCERTAIN","postflight":"WORKFLOW_REHEARSAL_POSTFLIGHT_DRIFT"}')
  expect(h.batches()).toBe(1)
 })
 it('censuses an early tagged query before application_name is assigned and refuses uncertain termination',async()=>{
  const sql=workflowBackendCensusSql(owner)
  expect(sql).toContain("or left(query,")
  const query=vi.fn(async()=>({rows:[{server_time:'2026-10-05T00:00:11Z',backends:[{...backend,applicationName:''}]}]}))
  await expect(closeOwnedWorkflowBackend({query,owner})).rejects.toThrow('FOREIGN_BACKEND')
  expect(query).toHaveBeenCalledTimes(1)
 })
})

describe('reviewed managed DDL and SELECT-only identity admission',()=>{
 it('pins all six exact managed registrations with source and attribute comparisons',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]})
  for(const token of ['80e0c97f0a475697c1b517e0d27887bfa0c2baf138229735a58a345d2168505b','pgrst_ddl_watch','issue_pg_net_access','evtname','evtevent','evttags','evtfoid','provolatile','MANAGED_DDL_CHANGED'])expect(sql).toContain(token)
  expect(sql).not.toContain("where evtenabled<>'D'")
  expect(sql).toContain('PGTAP_NOT_INSTALLED')
 })
 const readOnly=[{sql:'create function private.read_events() returns bigint language sql as $$select count(*) from public.workflow_node_events$$;'}]
 it('admits only the explicitly SELECT-only workflow-node identity without a gap exception',()=>{
  const inventory=workflowDependencyInventory({baseMigrations:readOnly,migrations:[],suites:[{sql:'select private.read_events();'}]})
  expect(inventory.selectOnlyIdentities).toEqual([{relation:'public.workflow_node_events',column:'id',sequence:'public.workflow_node_events_id_seq'}])
  expect(workflowDependencyPreflightSql(inventory)).toContain('WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY')
  expect(workflowSequenceNames).not.toContain('public.workflow_node_events_id_seq')
 })
 it.each(['insert into public.workflow_node_events default values','update workflow_node_events set id=1','delete from public.workflow_node_events','merge into public.workflow_node_events using public.other on false when not matched then insert default values','truncate table public.workflow_node_events','copy public.workflow_node_events from stdin','insert /* nested /* comment */ comment */ into public.workflow_node_events default values','update "public"."workflow_node_events" set id=1','truncate public.other,public.workflow_node_events'])('rejects a reachable writer before the third identity is admitted: %s',writer=>{
  const baseMigrations=[...readOnly,{sql:'create function private.writer() returns void language sql as $$'+writer+'$$;'}]
  expect(()=>workflowDependencyInventory({baseMigrations,migrations:[],suites:[{sql:'select private.read_events(); select private.writer();'}]})).toThrow('WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY')
 })
 it('rejects writers reached through attached triggers',()=>{
  const baseMigrations=[...readOnly,{sql:'create function private.writer() returns trigger language plpgsql as $$begin insert into public.workflow_node_events default values;return new;end$$; create trigger writer after insert on public.other for each row execute function private.writer();'}]
  expect(()=>workflowDependencyInventory({baseMigrations,migrations:[],suites:[{sql:'select private.read_events(); insert into public.other values(1);'}]})).toThrow('WORKFLOW_REHEARSAL_SELECT_ONLY_IDENTITY')
 })
})

describe('manifest-authorized transient bundled pgTAP',()=>{
 it('binds exact bundled version, schema, absence and rollback semantics in preview without a query',async()=>{
  const query=vi.fn(),result=await runWorkflowRehearsal({...fixture(),query})
  expect(result.schemaVersion).toBe(5)
  expect(result.pgTapSetup).toMatchObject({mode:'transactional-create-per-suite',name:'pgtap',version:'1.3.3',schema:'extensions',baseline:'absent',cascade:false,retain:false})
  expect(result.executionSources.some((source:{name:string})=>source.name==='scripts/c1-cost-workflow-rehearsal-pgtap.mjs')).toBe(true)
  expect(query).not.toHaveBeenCalled()
 })
 it('keeps the read-only initial preflight separate from each versioned extension creation',async()=>{
  const h=harness();await execute(h)
  const sql=h.query.mock.calls.map(([s])=>s)
  expect(sql[0]).toContain('WORKFLOW_REHEARSAL_PGTAP_EXPECT_ABSENT')
  expect(sql[0]).not.toMatch(/^\s*create\s+extension\b/im)
  const batches=sql.filter(s=>s.startsWith('/*c1cw-'))
  expect(batches).toHaveLength(4)
  for(const batch of batches){
   const install="create extension pgtap with schema extensions version '1.3.3';"
   expect(batch.match(/create extension pgtap with schema extensions version '1.3.3';/g)).toHaveLength(1)
   expect(batch.indexOf('WORKFLOW_REHEARSAL_PGTAP_EXPECT_ABSENT')).toBeLessThan(batch.indexOf(install))
   expect(batch.indexOf(install)).toBeLessThan(batch.indexOf('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION'))
   expect(batch.indexOf(install)).toBeLessThan(batch.indexOf('select plan('))
   expect(batch.lastIndexOf('rollback;')).toBeGreaterThan(batch.indexOf(install))
   expect(batch).not.toMatch(/create extension pgtap[^;]*cascade/i)
  }
 })
 it('fails closed before temporary DDL if availability or install privileges have drifted',async()=>{
  const h=harness((sql,response)=>{if(!sql.startsWith('/*')&&sql.includes('workflow_dependencies'))throw new Error('WORKFLOW_REHEARSAL_PGTAP_PREREQUISITES');return response})
  await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_PGTAP_PREREQUISITES')
  expect(h.batches()).toBe(0);expect(h.lease.release).toHaveBeenCalledTimes(1)
 })
 it('postflights and closes its owned session after temporary extension setup failure without replay',async()=>{
  const h=harness((sql,response)=>{if(sql.startsWith('/*')&&sql.includes("create extension pgtap with schema extensions version '1.3.3';"))throw new Error('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION');return response})
  await expect(execute(h)).rejects.toThrow('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION')
  expect(h.batches()).toBe(1)
  expect(h.query.mock.calls.some(([s])=>s.includes('pg_stat_activity'))).toBe(true)
  expect(h.query.mock.calls.filter(([s])=>s.includes('workflow_snapshot_result'))).toHaveLength(2)
  expect(h.lease.release).toHaveBeenCalledTimes(1)
 })
 it('distinguishes available-before-install from exact-installed-after-install and refuses unknown phases',()=>{
  const inventory={functions:[],relations:[],triggers:[]}
  const available=workflowDependencyPreflightSql(inventory,{pgTapPhase:'available'})
  expect(available).toContain('pg_available_extension_versions')
  expect(available).toContain('WORKFLOW_REHEARSAL_PGTAP_EXPECT_ABSENT')
  expect(available).not.toContain('WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED')
  const installed=workflowDependencyPreflightSql(inventory)
  expect(installed).toContain('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION')
  expect(()=>workflowDependencyPreflightSql(inventory,{pgTapPhase:'unreviewed'})).toThrow('WORKFLOW_REHEARSAL_PGTAP_PHASE')
 })
})

describe('reviewed server-managed JWT role expression',()=>{
 it('recognizes the exact coalesce role helper with redundant text result cast without allowing arbitrary bodies',()=>{
  const body="select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text".replace(/[\s;]/g,'').toLowerCase()
  expect(workflowAuthHelperExpressions.role).toContain(body)
  expect(workflowAuthHelperExpressions.role).not.toContain("select'authenticated'::text")
 })
})

describe('historical dynamic correction provenance',()=>{
 it('reconstructs existing corrected baseline bodies without modifying raw applied sources',()=>{
  const baseMigrations=readWorkflowBaseMigrations(),original=JSON.stringify(baseMigrations)
  const result=workflowDependencyInventory({baseMigrations,migrations:[],suites:[{sql:'select private.c1_link_cost_evidence(); select private.c1_finalize_cost_evidence(); select private.c1_correct_published_project_cost();'}]})
  for(const [name,sha256] of [
   ['private.c1_link_cost_evidence','8e27acd5484ac9bb16682dfd0b1f51e265d21e11070ac02916b2c616cc6f2a5a'],
   ['private.c1_finalize_cost_evidence','03637014cdfa9ba47231f769c895ef08a9ed560c484930eef32387509e11cba9'],
   ['private.c1_correct_published_project_cost','ae2325a43801386b88c248b8a2830f2238cf446fc5c0799df27065d7806d8d94']
  ])expect(result.functions.find((fn:{name:string})=>fn.name===name)).toMatchObject({sha256})
  expect(JSON.stringify(baseMigrations)).toBe(original)
  expect(result.relations).not.toContain('public.c1_project_cost_item_details_sync')
  expect(result.relations).toContain('public.project_cost_item_details')
 })
 it('rejects changed historical dynamic correction provenance',()=>{
  const baseMigrations=readWorkflowBaseMigrations()
  baseMigrations.find((file:{name:string})=>file.name==='20260922092309_c1_accounting_write_evidence_kind_contract_fix.sql')!.sql+=' -- unreviewed change'
  expect(()=>workflowDependencyInventory({baseMigrations,migrations:[],suites:[]})).toThrow('WORKFLOW_REHEARSAL_BASELINE_CORRECTION_DRIFT')
 })
 it('rejects an unresolved schema-qualified constraint reference rather than treating it as a relation',()=>{
  expect(()=>workflowDependencyInventory({baseMigrations:[],migrations:[],suites:[{sql:'set constraints public.unknown_guard immediate;'}]})).toThrow('WORKFLOW_REHEARSAL_CONSTRAINT_UNREVIEWED')
 })
 it('binds the source-only correction profiles and their provenance into the manifest',()=>{
  const result=reviewWorkflowRehearsal(fixture())
  expect(result.reviewedBaselineCorrections).toHaveLength(3)
  expect(result.reviewedBaselineCorrections.every((entry:{provenanceSha256:string})=>/^[a-f0-9]{64}$/.test(entry.provenanceSha256))).toBe(true)
 })
})

describe('exact managed Storage dependency baseline',()=>{
 it('pins managed object delete and update guards without weakening the source-owned completed-project guard',()=>{
  const result=workflowDependencyInventory({baseMigrations:readWorkflowBaseMigrations(),migrations:[],suites:[{sql:'select 1 from storage.objects; select 1 from storage.buckets;'}]})
  expect(result.triggers).toEqual(expect.arrayContaining([
   expect.objectContaining({key:'storage.objects:protect_objects_delete',fn:'storage.protect_delete',type:10,enabled:'O'}),
   expect.objectContaining({key:'storage.objects:update_objects_updated_at',fn:'storage.update_updated_at_column',type:19,enabled:'O'}),
   expect.objectContaining({key:'storage.objects:a_c1_completed_project_evidence_guard',fn:'private.c1_guard_completed_project_write',enabled:'O'})
  ]))
  expect(result.reachableFunctions).toContain('storage.protect_delete')
  expect(result.functions.find((fn:{name:string})=>fn.name==='storage.protect_delete')).toMatchObject({definer:false,config:[],language:'plpgsql',strict:false})
 })
 it('binds all seven exact managed trigger registrations and five function sources into preview',()=>{
  const result=reviewWorkflowRehearsal(fixture())
  expect(result.managedStorageBaseline.triggers).toHaveLength(7)
  expect(result.managedStorageBaseline.functions).toHaveLength(5)
  expect(result.executionSources.some((source:{name:string})=>source.name==='scripts/c1-cost-workflow-rehearsal-managed-storage.mjs')).toBe(true)
 })
})

describe('live PostgreSQL catalogue alias safety',()=>{
 it('avoids a SQL alias colliding with the PLpgSQL loop record',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]})
  expect(sql).not.toContain('from pg_rewrite r ')
  expect(sql).not.toContain('join dependencies r ')
  expect(sql).toContain('rewrite_row.ev_class')
  expect(sql).toContain('dependency_node.classid')
 })
})

describe('bounded existing RLS dependency roots',()=>{
 it('includes the exact nine existing source-reviewed policy helpers and their callees',()=>{
  const result=workflowDependencyInventory({baseMigrations:readWorkflowBaseMigrations(),migrations:[],suites:[{sql:'select 1 from public.project_cost_items;'}]})
  for(const name of ['private.c1_can_read_project_cost','private.c1_can_read_project_cost_detail','private.c1_can_read_project_cost_detail_evidence_metadata','private.c1_can_read_project_cost_detail_source','private.c1_can_read_source','private.can_read_role_catalog','private.has_any_active_company_membership','public.is_company_member','public.is_tenant_member'])expect(result.reachableFunctions).toContain(name)
  expect(reviewWorkflowRehearsal(fixture()).reviewedPolicyRoots).toHaveLength(9)
 })
 it('admits implicit Storage calls only through the five exact pinned routine names',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]})
  expect(sql).toContain('managed_storage ? fn_name')
  expect(sql).toContain('storage.protect_delete')
  expect(sql).not.toContain("r.nspname in('public','private','storage')")
 })
})

describe('existing SQL conditional expression admission',()=>{
 it('recognizes LEAST and GREATEST syntax while retaining unknown function rejection',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]})
  expect(sql).toContain("'coalesce','least','greatest','nullif'")
  expect(sql).toContain('WORKFLOW_REHEARSAL_IMPLICIT_EXPRESSION_UNREVIEWED')
 })
})

describe('recorded existing expression tokens',()=>{
 it('distinguishes four unqualified SQL keywords and the pure string parser from unknown qualified calls',()=>{
  const sql=workflowDependencyPreflightSql({functions:[],relations:[],triggers:[]})
  expect(sql).toContain("token.name in('exists','from','on','where')")
  expect(sql).toContain("'string_to_array'")
  expect(sql).toContain("if calls ? token.name or calls ? ('public.'||token.name)")
  expect(sql).toContain('WORKFLOW_REHEARSAL_IMPLICIT_EXPRESSION_UNREVIEWED')
 })
})
