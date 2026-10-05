import {createHash} from 'node:crypto'
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
 * No installed decoder can establish complete PDF/PNG/JPEG coverage in this environment.
 * All formats therefore remain incomplete with unknown page count (0), including matching files.
 * No positive decoder/report injection, native hints, PDF token counting or image-size shortcut.
 * Replacing this boundary requires a separately approved full decoder and strict coverage tests.
 */
export function createAzureF0DocumentInspector(expected:Readonly<AzureF0DocumentMetadata>,readMetadata:MetadataReader):AzureF0Options['inspect']{
 const pinned=Object.freeze(Object.fromEntries(metadataKeys.map(key=>[key,expected[key]]))) as Readonly<AzureF0DocumentMetadata>
 return async input=>{
  const bytes=Uint8Array.from(input.bytes)
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const incomplete:DocumentInspection={sha256,complete:false,pageCount:0}
  if(!validMetadata(pinned)||input.fileId!==pinned.fileId
   ||input.scope.companyId!==pinned.companyId||input.scope.projectId!==pinned.projectId
   ||input.mimeType!==pinned.mimeType||bytes.byteLength!==pinned.sizeBytes||sha256!==pinned.sha256)return incomplete
  try{
   const fresh=await readMetadata(pinned)
   if(!fresh||!validMetadata(fresh)||metadataKeys.some(key=>fresh[key]!==pinned[key]))return incomplete
  }catch{return incomplete}
  // Identity and byte integrity are necessary, but never attest decoder coverage.
  return incomplete
 }
}
