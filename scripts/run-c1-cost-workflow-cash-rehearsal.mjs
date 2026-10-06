import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runWorkflowRehearsal} from './run-c1-cost-workflow-rehearsal.mjs'
export const runWorkflowCashRehearsal=options=>runWorkflowRehearsal({...options,profile:'cash22'})
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),execute=args[0]==='--execute',captureBaseline=args[0]==='--capture-baseline'
 if(args.length&&!(
  captureBaseline&&args.length===3&&args[1]==='--confirm-manifest-sha256'||
  execute&&args.length===7&&args[1]==='--confirm-manifest-sha256'&&args[3]==='--baseline-file'&&args[5]==='--confirm-baseline-sha256'
 ))throw Error('Usage: [--capture-baseline --confirm-manifest-sha256 HASH] or [--execute --confirm-manifest-sha256 HASH --baseline-file FILE --confirm-baseline-sha256 HASH]')
 let baseline
 if(execute){try{baseline=JSON.parse(readFileSync(resolve(args[4]),'utf8'))}catch{throw Error('WORKFLOW_REHEARSAL_BASELINE_INVALID')}}
 const result=await runWorkflowCashRehearsal({execute,captureBaseline,confirmation:args[2],authorization:process.env.TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL,baseline,baselineConfirmation:args[6]})
 if(result.mode==='baseline-captured'){
  const file=resolve('.superpowers/sdd/2026-10-04-document-backed-installment-approval','native-accepted-baseline-'+result.baseline.sha256+'.json')
  writeFileSync(file,JSON.stringify(result.baseline,null,2),{mode:0o600,flag:'wx'})
  console.log(JSON.stringify({mode:result.mode,manifestSha256:result.manifestSha256,baselineSha256:result.baseline.sha256,baselineFile:file,catalogueObjectCount:result.baseline.row.snapshot.catalogueObjectCount},null,2))
 }else console.log(JSON.stringify(result,null,2))
}
