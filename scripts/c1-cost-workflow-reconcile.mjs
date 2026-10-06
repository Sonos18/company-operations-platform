import {createHash,randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {z} from 'zod'
import {workflowUserRpc} from './c1-cost-workflow-client.mjs'
const uuid=z.string().uuid(),sha=z.string().regex(/^[a-f0-9]{64}$/)
const money=z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
const input=z.object({legacyKind:z.enum(['ordinary_detail','subcontract_payment']),legacyId:uuid,actualOutgoing:money,actualPaymentDate:z.string().date().nullable(),evidenceFileIds:z.array(uuid).min(1).max(100).refine(v=>new Set(v).size===v.length),reason:z.string().trim().min(1).max(2000),expectedLegacyHash:sha}).strict().refine(v=>/[1-9]/.test(v.actualOutgoing)?v.actualPaymentDate!==null:v.actualPaymentDate===null)
const schema=z.object({schemaVersion:z.literal(1),projectRef:z.literal('gtgljlnhwvhqdnwrfdfj'),companyId:uuid,projectId:uuid,inventoryScopeHash:sha,review:z.object({accountantReviewed:z.literal(true),historicalCashOnly:z.literal(true),noHistoricalApprovalFabricated:z.literal(true),capMappingReviewed:z.boolean()}).strict(),items:z.array(z.object({idempotencyKey:uuid,input}).strict()).min(1).max(500)}).strict()
export function reviewManifest(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>262144)throw new Error('WORKFLOW_MANIFEST_INVALID')
 let manifest
 try{manifest=schema.parse(JSON.parse(raw))}catch{throw new Error('WORKFLOW_MANIFEST_INVALID')}
 const identities=manifest.items.map(v=>v.input.legacyKind+':'+v.input.legacyId)
 if(new Set(identities).size!==identities.length||new Set(manifest.items.map(v=>v.idempotencyKey)).size!==manifest.items.length)throw new Error('WORKFLOW_MANIFEST_DUPLICATE')
 return {manifest,manifestSha256:createHash('sha256').update(raw).digest('hex')}
}
export async function runReconciliation({raw,execute=false,confirmation,authorization,rpc}){
 const {manifest,manifestSha256}=reviewManifest(raw)
 const preview={mode:'preview',manifestSha256,projectRef:manifest.projectRef,companyId:manifest.companyId,projectId:manifest.projectId,inventoryScopeHash:manifest.inventoryScopeHash,capMappingReviewed:manifest.review.capMappingReviewed,changes:manifest.items}
 if(!execute)return preview
 if(confirmation!==manifestSha256||authorization!==manifestSha256)throw new Error('WORKFLOW_RECONCILIATION_AUTHORIZATION_REQUIRED')
 const current=await rpc('c1_workflow_inventory',{target_company_id:manifest.companyId,target_project_id:manifest.projectId})
 if(current?.scopeHash!==manifest.inventoryScopeHash)throw new Error('WORKFLOW_INVENTORY_CHANGED')
 const receipts=[]
 for(const item of manifest.items){
  const result=await rpc('c1_workflow_reconcile_legacy_cash',{target_company_id:manifest.companyId,target_project_id:manifest.projectId,target_input:item.input,target_idempotency_key:item.idempotencyKey,target_request_id:randomUUID()})
  if(!result?.reconciliationId||result.version!==1||typeof result.replayed!=='boolean')throw new Error('WORKFLOW_RECONCILIATION_RECEIPT_INVALID')
  receipts.push({legacyKind:item.input.legacyKind,legacyId:item.input.legacyId,idempotencyKey:item.idempotencyKey,result})
 }
 return {...preview,mode:'executed',receipts}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2)
 if(args[0]!=='--manifest'||![2,5].includes(args.length)||(args.length===5&&(args[2]!=='--execute'||args[3]!=='--confirm-manifest-sha256')))throw new Error('Usage: --manifest PATH [--execute --confirm-manifest-sha256 HASH]')
 const execute=args.length===5,raw=readFileSync(resolve(args[1]),'utf8')
 // Preview has no network or configuration side effect.
 const result=await runReconciliation({raw,execute,confirmation:args[4],authorization:process.env.TASKOVIA_WORKFLOW_RECONCILIATION_APPROVAL,rpc:execute?workflowUserRpc():undefined})
 console.log(JSON.stringify(result,null,2))
}
