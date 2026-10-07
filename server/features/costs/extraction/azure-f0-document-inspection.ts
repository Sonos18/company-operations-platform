import {createHash} from 'node:crypto'
import {decodeAzureF0Image} from './azure-f0-image-inspection'
import type {DocumentInspection,AzureF0Options} from './azure-f0-cost-extraction'

/** Private original-file metadata, read by an authenticated server closure, never a browser report. */
export interface AzureF0DocumentMetadata{
 tenantId:string
 companyId:string
 projectId:string
 fileId:string
 fileVersion:number
 sha256:string
 mimeType:string
 sizeBytes:number
}
type MetadataReader=(expected:Readonly<AzureF0DocumentMetadata>)=>Promise<Readonly<AzureF0DocumentMetadata>|null>
const metadataKeys=['tenantId','companyId','projectId','fileId','fileVersion','sha256','mimeType','sizeBytes'] as const
const formats=new Set(['application/pdf','image/png','image/jpeg'])
function validMetadata(value:Readonly<AzureF0DocumentMetadata>){
 return ['tenantId','companyId','projectId','fileId'].every(key=>{
  const id=value[key as 'tenantId'|'companyId'|'projectId'|'fileId']
  return typeof id==='string'&&id.length>0&&id.length<=200&&id.trim()===id
 })&&Number.isSafeInteger(value.fileVersion)&&value.fileVersion>0
  &&Number.isSafeInteger(value.sizeBytes)&&value.sizeBytes>0&&value.sizeBytes<=4_000_000
  &&typeof value.sha256==='string'&&/^[0-9a-f]{64}$/.test(value.sha256)
  &&formats.has(value.mimeType)
}
/** Prepared fail-closed port; return value is the adapter's exact DocumentInspection contract.
 * Snapshot trusted construction-time identity and exact bytes before an asynchronous fresh read.
 * The reader must re-read original metadata under fresh actor/tenant/company/project permissions;
 * it is not an authorization substitute and must not be built from client-supplied metadata.
 *
 * This default boundary uses no decoder: every format remains incomplete with page count 0.
 * The explicit image factory below adds concrete guarded decoding with separately approved
 * packages; PDF and unsupported image variants stay incomplete. No injected positive report,
 * native hints, PDF token counting or image-size shortcut can attest coverage.
 */
export function createAzureF0DocumentInspector(expected:Readonly<AzureF0DocumentMetadata>,readMetadata:MetadataReader):AzureF0Options['inspect']{
 return createInspector(expected,readMetadata,false)
}
/** Explicit image-only integration, requiring exact approved decoder packages. PDF remains incomplete. */
export function createAzureF0ImageDocumentInspector(expected:Readonly<AzureF0DocumentMetadata>,readMetadata:MetadataReader):AzureF0Options['inspect']{
 return createInspector(expected,readMetadata,true)
}
function createInspector(expected:Readonly<AzureF0DocumentMetadata>,readMetadata:MetadataReader,images:boolean):AzureF0Options['inspect']{
 const pinned=Object.freeze(Object.fromEntries(metadataKeys.map(key=>[key,expected[key]]))) as Readonly<AzureF0DocumentMetadata>
 return async input=>{
  const bytes=Uint8Array.from(input.bytes),mimeType=input.mimeType
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const incomplete:DocumentInspection={sha256,complete:false,pageCount:0}
  if(!validMetadata(pinned)||input.fileId!==pinned.fileId
   ||input.scope.companyId!==pinned.companyId||input.scope.projectId!==pinned.projectId
   ||mimeType!==pinned.mimeType||bytes.byteLength!==pinned.sizeBytes||sha256!==pinned.sha256)return incomplete
  try{
   const fresh=await readMetadata(pinned)
   if(!fresh||!validMetadata(fresh)||metadataKeys.some(key=>fresh[key]!==pinned[key]))return incomplete
  }catch{return incomplete}
  if(images&&await decodeAzureF0Image(bytes,mimeType)){
   // Decode crosses a process boundary. Revalidate original access/version after
   // it settles and before issuing the positive coverage attestation.
   try{
    const fresh=await readMetadata(pinned)
    if(!fresh||!validMetadata(fresh)||metadataKeys.some(key=>fresh[key]!==pinned[key]))return incomplete
   }catch{return incomplete}
   return {sha256,complete:true,pageCount:1}
  }
  return incomplete
 }
}
