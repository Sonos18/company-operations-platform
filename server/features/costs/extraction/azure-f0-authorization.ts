import {createHash} from 'node:crypto'
import type {AzureF0Options} from './azure-f0-cost-extraction'
import type {AzureF0DocumentMetadata} from './azure-f0-document-inspection'
export interface AzureF0RequestAccess extends AzureF0DocumentMetadata{
 actorId:string
 requestId:string|null
 requestVersion:number|null
 permissions:readonly string[]
}
const required=['cost.prepare','cost.request.submit','cost.request.file.read','cost.request.read'] as const
const identity=['actorId','tenantId','companyId','projectId','fileId','fileVersion','requestId','requestVersion','sha256','mimeType','sizeBytes'] as const
function valid(access:Readonly<AzureF0RequestAccess>){
 return ['actorId','tenantId','companyId','projectId','fileId'].every(key=>{
  const value=access[key as 'actorId'|'tenantId'|'companyId'|'projectId'|'fileId']
  return typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value
 })&&Number.isSafeInteger(access.fileVersion)&&access.fileVersion>0
  &&Number.isSafeInteger(access.sizeBytes)&&access.sizeBytes>0&&access.sizeBytes<=4_000_000
  &&typeof access.sha256==='string'&&/^[a-f0-9]{64}$/.test(access.sha256)
  &&['application/pdf','image/png','image/jpeg'].includes(access.mimeType)
  &&(access.requestId===null?access.requestVersion===null:typeof access.requestId==='string'&&access.requestId.trim()===access.requestId&&access.requestId.length>0&&access.requestId.length<=200&&Number.isSafeInteger(access.requestVersion)&&access.requestVersion!==null&&access.requestVersion>=0)
  &&Array.isArray(access.permissions)&&required.every(permission=>access.permissions.includes(permission))
}
/** The reader must re-resolve the authenticated session/active actor and use
 * user-scoped original/request authorization on every call. Never synthesize
 * permissions from a cached WorkflowContext or use the quota service-role client.
 * This port compares fresh evidence; it does not implement those database checks.
 */
export function createAzureF0RequestAuthorizer(expected:Readonly<AzureF0RequestAccess>,readAccess:(expected:Readonly<AzureF0RequestAccess>)=>Promise<Readonly<AzureF0RequestAccess>|null>):AzureF0Options['authorize']{
 const pinned=Object.freeze({...Object.fromEntries(identity.map(key=>[key,expected[key]])),permissions:Object.freeze(Array.isArray(expected.permissions)?[...expected.permissions]:[])}) as Readonly<AzureF0RequestAccess>
 return async input=>{
  if(!valid(pinned)||input.fileId!==pinned.fileId||input.scope.companyId!==pinned.companyId||input.scope.projectId!==pinned.projectId||input.mimeType!==pinned.mimeType||input.bytes.byteLength!==pinned.sizeBytes||createHash('sha256').update(input.bytes).digest('hex')!==pinned.sha256)return false
  try{
   const fresh=await readAccess(pinned)
   return !!fresh&&valid(fresh)&&identity.every(key=>fresh[key]===pinned[key])
  }catch{return false}
 }
}
