import {createHash} from 'node:crypto'
import {cpSync,readFileSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,realpathSync} from 'node:fs'
import {join,resolve,dirname,relative,sep} from 'node:path'
import {tmpdir} from 'node:os'
import {workflowRemainingEvidencePins,workflowRemainingAcceptedBaselinePins,workflowRemainingRetryEvidencePins,workflowRemainingMaintenancePins} from '../../../../scripts/c1-cost-workflow-rehearsal-remaining.mjs'
import {workflowCashEvidencePins} from '../../../../scripts/c1-cost-workflow-rehearsal-cash.mjs'
const fixturePath='tests/fixtures/costs/rehearsal'
const directory='.superpowers/sdd/2026-10-04-document-backed-installment-approval'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
export function verifyCurrentRehearsalFixtureSources(cwd,manifest=JSON.parse(readFileSync(resolve(cwd,fixturePath,'current-source-pins.json'),'utf8'))){
 if(manifest.schemaVersion!==1||manifest.sources.length!==4)throw Error('CURRENT_REHEARSAL_FIXTURE_SOURCE_CHANGED')
 for(const source of manifest.sources){
  if(sha(readFileSync(resolve(cwd,source.name)))!==source.currentSha256||sha(readFileSync(resolve(cwd,fixturePath,'historical-sources',source.name)))!==source.historicalSha256)throw Error('CURRENT_REHEARSAL_FIXTURE_SOURCE_CHANGED')
 }
 return manifest
}
/** Private mock-only filesystem: retained receipt bytes and old source pins remain immutable.
 * Production profiles still reject the changed current source before any target/DB access.
 */
export function createHistoricalRehearsalFixture(cwd){
 const manifest=verifyCurrentRehearsalFixtureSources(cwd)
 const root=mkdtempSync(join(tmpdir(),'taskovia-rehearsal-historical-'))
 const dispose=()=>{
  const parent=resolve(tmpdir()),candidate=resolve(root),rel=relative(parent,candidate)
  if(dirname(candidate)!==parent||!rel.startsWith('taskovia-rehearsal-historical-')||rel.includes(sep))throw Error('HISTORICAL_FIXTURE_CLEANUP_SCOPE')
  rmSync(candidate,{recursive:true,force:true})
 }
 try{
  for(const name of ['scripts','supabase/migrations','supabase/tests/database/c1','supabase/templates','supabase/config.toml','package.json','pnpm-lock.yaml']){
   const dest=resolve(root,name);mkdirSync(dirname(dest),{recursive:true});cpSync(resolve(cwd,name),dest,{recursive:true})
  }
  symlinkSync(realpathSync(resolve(cwd,'node_modules')),resolve(root,'node_modules'),'dir')
  for(const source of manifest.sources){
   cpSync(resolve(cwd,fixturePath,'historical-sources',source.name),resolve(root,source.name))
  }
  const pins={...workflowRemainingEvidencePins,...workflowRemainingAcceptedBaselinePins,...workflowRemainingRetryEvidencePins,...workflowRemainingMaintenancePins,...workflowCashEvidencePins}
  mkdirSync(resolve(root,directory),{recursive:true})
  for(const [name,expected] of Object.entries(pins)){
   const bytes=readFileSync(resolve(cwd,directory,name))
   if(sha(bytes)!==expected)throw Error('HISTORICAL_REHEARSAL_EVIDENCE_CHANGED')
   cpSync(resolve(cwd,directory,name),resolve(root,directory,name))
  }
  return {root,dispose}
 }catch(error){dispose();throw error}
}
