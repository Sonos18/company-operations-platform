import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {workflowUserRpc} from './c1-cost-workflow-client.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function readInventory({companyId,projectId,rpc}){
 if(!uuid.test(companyId??'')||!uuid.test(projectId??''))throw new Error('WORKFLOW_INVENTORY_SCOPE_REQUIRED')
 const result=await rpc('c1_workflow_inventory',{target_company_id:companyId,target_project_id:projectId})
 if(result?.companyId!==companyId||result?.projectId!==projectId||result?.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(result?.scopeHash??''))throw new Error('WORKFLOW_INVENTORY_RESPONSE_INVALID')
 return result
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args.length!==4||args[0]!=='--company'||args[2]!=='--project')throw new Error('Usage: --company UUID --project UUID; read-only scoped inventory')
 const result=await readInventory({companyId:args[1],projectId:args[3],rpc:workflowUserRpc()})
 console.log(JSON.stringify(result,null,2))
}
