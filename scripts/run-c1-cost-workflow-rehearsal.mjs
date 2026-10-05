import {createHash} from 'node:crypto'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {assertCloudDevTarget} from './assert-cloud-dev-target.mjs'
import {isolatedSupabaseEnvironment} from './run-supabase-dev.mjs'
import {buildC1MigrationRehearsalSql,validateC1MigrationRehearsalSql} from './run-c1-cloud-dev-migration-rehearsal.mjs'
import {costWorkflowSqlFiles,validateCostWorkflowSql,assertWorkflowTapResult} from './run-c1-cost-workflow-tests.mjs'
import {workflowRehearsalSetupSql,workflowHistoryCaptureSql,workflowHistoryClosureSql} from './c1-cost-workflow-rehearsal-guards.mjs'
export const costWorkflowMigrationFiles=[
 '20261004210000_c1_cost_workflow_foundation.sql',
 '20261004210100_c1_cost_workflow_security.sql',
 '20261004210200_c1_cost_request_evidence.sql',
 '20261004210300_c1_cost_workflow_request_commands.sql',
 '20261004210400_c1_cost_workflow_cash_commands.sql',
 '20261004210500_c1_cost_workflow_reconciliation.sql',
 '20261004210600_c1_cost_workflow_extraction.sql',
 '20261004210700_c1_cost_workflow_directory.sql',
]
export const costWorkflowAssertionCounts=[80,13,28,22]
const sha=value=>createHash('sha256').update(value).digest('hex')
export function reviewWorkflowRehearsal({migrations,suites}){
 if(!Array.isArray(migrations)||migrations.length!==costWorkflowMigrationFiles.length||migrations.some((m,i)=>m.name!==costWorkflowMigrationFiles[i]||typeof m.sql!=='string'||!m.sql.trim()))throw new Error('WORKFLOW_REHEARSAL_MIGRATION_SET')
 const ddl=migrations.map(m=>m.sql).join('\n')
 buildC1MigrationRehearsalSql(ddl)
 if(!Array.isArray(suites)||suites.length!==costWorkflowSqlFiles.length||suites.some((s,i)=>s.name!==costWorkflowSqlFiles[i]))throw new Error('WORKFLOW_REHEARSAL_TEST_SET')
 for(const [index,suite] of suites.entries()){
  validateCostWorkflowSql(suite.name,suite.sql)
  const plans=[...suite.sql.matchAll(/select\s+plan\((\d+)\)/gi)]
  if(plans.length!==1||Number(plans[0][1])!==costWorkflowAssertionCounts[index])throw new Error('WORKFLOW_REHEARSAL_PLAN')
 }
 const manifest={schemaVersion:2,runnerSha256:sha(readFileSync(fileURLToPath(import.meta.url),'utf8')),guardSha256:sha(readFileSync(fileURLToPath(new URL('./c1-cost-workflow-rehearsal-guards.mjs',import.meta.url)),'utf8')),projectRef:'gtgljlnhwvhqdnwrfdfj',operation:'rollback-only-DDL-and-synthetic-pgTAP',migrations:migrations.map(m=>({name:m.name,sha256:sha(m.sql)})),suites:suites.map((s,i)=>({name:s.name,sha256:sha(s.sql),assertions:costWorkflowAssertionCounts[i]})),retention:'Each suite replays exact DDL in its own transaction and rolls back; no migration-history repair or fixture cleanup.'}
 return {...manifest,manifestSha256:sha(JSON.stringify(manifest))}
}
export function readWorkflowRehearsal(cwd){
 return {migrations:costWorkflowMigrationFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/migrations',name),'utf8')})),suites:costWorkflowSqlFiles.map(name=>({name,sql:readFileSync(resolve(cwd,'supabase/tests/database/c1',name),'utf8')}))}
}
export async function runWorkflowRehearsal({cwd=process.cwd(),env=process.env,migrations,suites,execute=false,confirmation,authorization,assertTarget=assertCloudDevTarget,spawn=spawnSync}={}){
 const sources=migrations&&suites?{migrations,suites}:readWorkflowRehearsal(cwd)
 const manifest=reviewWorkflowRehearsal(sources)
 if(!execute)return {mode:'preview',...manifest}
 if(confirmation!==manifest.manifestSha256||authorization!==manifest.manifestSha256)throw new Error('WORKFLOW_REHEARSAL_AUTHORIZATION_REQUIRED')
 assertTarget({cwd,env})
 const cliEnv=isolatedSupabaseEnvironment(cwd,env,process.platform)
 const temporaryDirectory=mkdtempSync(join(tmpdir(),'taskovia-cost-workflow-rehearsal-'))
 const temporaryFile=join(temporaryDirectory,'rehearsal.sql')
 const receipts=[]
 try{
  for(const [index,suite] of sources.suites.entries()){
   const test=suite.sql.replace(/^\s*begin\s*;/i,'').replace(/rollback\s*;\s*$/i,'')
   const sql=buildC1MigrationRehearsalSql(workflowRehearsalSetupSql+workflowHistoryCaptureSql('before-DDL')+sources.migrations.map(m=>m.sql).join('\n')+'\n'+workflowHistoryCaptureSql('after-DDL')+"\nset local row_security=on;\n"+test+workflowHistoryClosureSql+"\nselect 'C1_COST_WORKFLOW_REHEARSAL_COMPLETE' as result;\n")
   validateC1MigrationRehearsalSql(sql)
   writeFileSync(temporaryFile,sql,'utf8')
   const result=spawn(process.execPath,[resolve(cwd,'node_modules/supabase/dist/supabase.js'),'db','query','--linked','--output-format','json','--file',temporaryFile],{cwd,env:cliEnv,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024})
   if(result.status!==0)throw new Error('WORKFLOW_REHEARSAL_EXECUTION_FAILED:'+suite.name)
   let response
   try{response=JSON.parse(String(result.stdout??''))}catch{throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')}
   const counts=assertWorkflowTapResult(response)
   if(counts.assertions!==costWorkflowAssertionCounts[index]||!response.rows.some(row=>row?.result==='C1_COST_WORKFLOW_HISTORY_CLOSED')||!response.rows.some(row=>row?.result==='C1_COST_WORKFLOW_REHEARSAL_COMPLETE'))throw new Error('WORKFLOW_REHEARSAL_RESULT_INVALID')
   receipts.push({suite:suite.name,assertions:counts.assertions,rollbackCommandExit:result.status})
  }
  return {mode:'executed',...manifest,receipts}
 }finally{
  // Only this invocation's freshly-created temporary directory is removed.
  rmSync(temporaryDirectory,{recursive:true,force:true})
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),execute=args[0]==='--execute'
 if(args.length&&!(execute&&args.length===3&&args[1]==='--confirm-manifest-sha256'))throw new Error('Usage: [--execute --confirm-manifest-sha256 HASH]')
 const result=await runWorkflowRehearsal({execute,confirmation:args[2],authorization:process.env.TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL})
 console.log(JSON.stringify(result,null,2))
}
