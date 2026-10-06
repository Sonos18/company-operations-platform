import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runWorkflowRehearsal} from './run-c1-cost-workflow-rehearsal.mjs'
import {workflowAzureProfile} from './c1-cost-workflow-rehearsal-azure.mjs'
export const runWorkflowAzureRehearsal=options=>runWorkflowRehearsal({...options,profile:workflowAzureProfile})
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.length&&!(args.length===3&&args[0]==='--execute-fresh'&&args[1]==='--confirm-manifest-sha256'))throw Error('Usage: [--execute-fresh --confirm-manifest-sha256 HASH]')
 const execute=args.length>0
 console.log(JSON.stringify(await runWorkflowAzureRehearsal({execute,freshBaseline:execute,confirmation:args[2],authorization:process.env.TASKOVIA_WORKFLOW_REHEARSAL_APPROVAL}),null,2))
}
