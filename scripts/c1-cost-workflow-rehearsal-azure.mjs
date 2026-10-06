import {workflowRemainingAdmissionSql} from './c1-cost-workflow-rehearsal-remaining.mjs'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {workflowSha} from './c1-cost-workflow-rehearsal-inventory.mjs'
import {workflowDependencyPreflightSql} from './c1-cost-workflow-rehearsal-catalog.mjs'
import {workflowRehearsalSetupSql,workflowHistoryCaptureSql} from './c1-cost-workflow-rehearsal-guards.mjs'
import {workflowManagedDdlGuardSql} from './c1-cost-workflow-rehearsal-managed-ddl.mjs'
export const workflowAzureProfile='azure124-managed-v1'
export const workflowAzureAssertions=124
export const workflowAzureFixture='c1_cost_ocr_azure_f0_storage.test.sql'
export const workflowAzureFixtureSha256='f269a0d1a9347ff150cb7f470d0198aa69a5913a66c08e90633032c931396c66'
export const workflowAzureMigrationPins=Object.freeze([
  {
    "name": "20261004210000_c1_cost_workflow_foundation.sql",
    "sha256": "4a81b62fe6b82abb44b2a633fa3987c2e05fd950780a36eb701b25da0622b1a0"
  },
  {
    "name": "20261004210100_c1_cost_workflow_security.sql",
    "sha256": "01ef323d06705180c2923945f4684d765e20b5b0b582dbac0a1b729fe2a1c360"
  },
  {
    "name": "20261004210200_c1_cost_request_evidence.sql",
    "sha256": "26539f5f08d7ad735c06f6cf336a5997bd36fd33d691725c43e58ab62fcbe574"
  },
  {
    "name": "20261004210300_c1_cost_workflow_request_commands.sql",
    "sha256": "89cf9b93f3a1137d8c1092535484310c04aa3558bacd4a751b0cfbe1060a8ed7"
  },
  {
    "name": "20261004210400_c1_cost_workflow_cash_commands.sql",
    "sha256": "c76d25c28e25f0463be81e304025464a7a6b530bb6f7cbad26fe54d8a4df01fd"
  },
  {
    "name": "20261004210500_c1_cost_workflow_reconciliation.sql",
    "sha256": "54692645e2cc788d96c562c5eda9588ac6fdbf7dace5ebd70b47e7823a22a916"
  },
  {
    "name": "20261004210600_c1_cost_workflow_extraction.sql",
    "sha256": "14f373a79bc367cabbb61e45fa19d9f33a47f85f13669ea435ac224317beae1a"
  },
  {
    "name": "20261004210700_c1_cost_workflow_directory.sql",
    "sha256": "8ef8cef866e5efc42062a0909ddec7b10fdbcc5975453cd10024fedef8ef6f94"
  },
  {
    "name": "20261005045710_c1_cost_ocr_azure_f0_storage.sql",
    "sha256": "fa357d4fdde925ae8329399b92bd18315029129b69d7eac07f56e999b64885fe"
  }
].map(item=>Object.freeze(item)))

export function readWorkflowAzureRehearsal(cwd){
 return {migrations:workflowAzureMigrationPins.map(({name})=>({name,sql:readFileSync(resolve(cwd,'supabase/migrations',name),'utf8')})),suites:[{name:workflowAzureFixture,sql:readFileSync(resolve(cwd,'supabase/tests/database/c1',workflowAzureFixture),'utf8')}]}
}
export function assertWorkflowAzureSources({migrations,suites}){
 if(!Array.isArray(migrations)||!isDeepStrictEqual(migrations.map(x=>({name:x.name,sha256:workflowSha(x.sql)})),workflowAzureMigrationPins)||suites?.length!==1||suites[0].name!==workflowAzureFixture||workflowSha(suites[0].sql)!==workflowAzureFixtureSha256)throw Error('WORKFLOW_REHEARSAL_AZURE_SOURCE_CHANGED')
 const sql=suites[0].sql
 if(!sql.trim().startsWith('-- SQL_UNEXECUTED:')||!sql.trim().endsWith('rollback;')||!sql.includes(workflowManagedDdlGuardSql)||!sql.includes('select plan(124);')||!sql.includes('select * from finish(true);'))throw Error('WORKFLOW_REHEARSAL_AZURE_SOURCE_CHANGED')
}
const oldNamespace='^c1f5[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
const azureNamespace='^c1f60000-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if(workflowRehearsalSetupSql.split(oldNamespace).length!==3)throw Error('WORKFLOW_REHEARSAL_AZURE_SETUP_SOURCE')
export const workflowAzureSetupSql=workflowRehearsalSetupSql.replaceAll(oldNamespace,azureNamespace)+"\ndo $azure_unapplied$\nbegin\n if exists(select 1 from supabase_migrations.schema_migrations where version='20261005045710')\n or to_regclass('private.c1_cost_ocr_azure_resources') is not null\n or to_regclass('private.c1_cost_ocr_azure_months') is not null\n or to_regclass('private.c1_cost_ocr_azure_jobs') is not null\n or to_regprocedure('public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb)') is not null\n then raise exception 'WORKFLOW_REHEARSAL_AZURE_ALREADY_INSTALLED';end if;\nend;$azure_unapplied$;\n"

export function workflowAzureHistoryCaptureSql(phase){
 const sql=workflowHistoryCaptureSql(phase),needle="where c.relkind in('r','p') and n.nspname in('public','private','auth','storage','supabase_migrations')"
 if(sql.split(needle).length!==2)throw Error('WORKFLOW_REHEARSAL_AZURE_HISTORY_SOURCE')
 // All three must be absent before DDL; exact full/all5 postflight covers rollback.
 return sql.replace(needle,needle+" and not(n.nspname='private' and c.relname in('c1_cost_ocr_azure_resources','c1_cost_ocr_azure_months','c1_cost_ocr_azure_jobs'))")
}
export function workflowAzureDependencyPreflightSql(inventory,options){
 const sql=workflowDependencyPreflightSql(inventory,options)
 const anchor="if r.nspname='pg_catalog' and r.proname in('now','clock_timestamp','gen_random_uuid','jsonb_typeof','jsonb_array_length','array_length','cardinality','btrim','length','char_length','lower','upper','num_nonnulls') then continue;end if;"
 const tokenAnchor="if token.name in('extensions.digest','extensions.gen_random_uuid','extensions.uuid_generate_v4','auth.uid') then continue;end if;"
 if(sql.split(anchor).length!==2||sql.split(tokenAnchor).length!==2)throw Error('WORKFLOW_REHEARSAL_AZURE_DEPENDENCY_SOURCE')
 // Only the pure internal TEXT function used by2 private job JSON-size checks.
 const exact="if r.nspname='pg_catalog' and r.proname='octet_length' and r.lanname='internal' and r.prosrc='textoctetlen' and r.pronargs=1 and r.proargtypes[0]='text'::regtype and r.prorettype='integer'::regtype and r.pronargdefaults=0 and r.provolatile='i' and r.proisstrict and not r.prosecdef and not r.proretset and r.proconfig is null then continue;end if;"
 return sql.replace(anchor,anchor+'\n  '+exact).replace(tokenAnchor,"if token.name in('octet_length','pg_catalog.octet_length') then continue;end if;\n   "+tokenAnchor)
}
export const workflowAzureExecutionScope=Object.freeze({
 profile:workflowAzureProfile,parentSource:'f334598f3c7645438521e4c880e38c89c59fd547',baseSource:'bac0f137e6f50df2f947fc0d3817be367f7f6737',
 fixtures:1,assertions:124,batches:1,syntheticOriginals:6,syntheticJobs:7,syntheticReservedPageUnits:10,syntheticCeiling:25,
 persistentAuditRoleAllowance:Object.freeze([0,0]),allOtherSequencesAllowance:0,
 migrations:'exact9 UNAPPLIED source files inside one rollback transaction only; no migration history insert/apply',
 pgTap:'exact existing server-bundled1.3.3 created once inside same rollback transaction; absent before/after',
 newBaseline:'fresh raw full catalogue/all5 retained; no historical restoration claim; exact admission/postflight',
 namespace:azureNamespace,newPrivateTablesMustBeAbsent:true,historyException:'only3 newly created private Azure tables; no existing rows excluded',
 admissionSeconds:30,transactionSeconds:120,clientBatchMs:120000,maximumTapAssertion:124,processAzureGates:false,credentialsOrProvider:false,automaticReplay:false
})

export function workflowAzureAdmissionSql(owner){
 const sql=workflowRemainingAdmissionSql(owner),needle="transaction_timeout='150s'"
 if(sql.split(needle).length!==2)throw Error('WORKFLOW_REHEARSAL_AZURE_ADMISSION_SOURCE')
 return sql.replace(needle,"transaction_timeout='120s'")
}
