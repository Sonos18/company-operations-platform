import type {CostExtractionAdapter} from '../../../../shared/schemas/costs/cost-extraction'
import type {CostExtractionServiceOptions} from './cost-extraction.service'
import {createCostExtractionAdapter,readAzureF0ServerConfiguration} from './cost-extraction-config'
import {createAzureF0RequestAuthorizer,type AzureF0RequestAccess} from './azure-f0-authorization'
import {createAzureF0ImageDocumentInspector,type AzureF0DocumentMetadata} from './azure-f0-document-inspection'
import {createAzureF0PdfAdmission} from './azure-f0-pdf-admission'
import {createAzureF0JobStore,type AzureF0PrivateRpc} from './azure-f0-job-store'
type FactoryInput=Parameters<NonNullable<CostExtractionServiceOptions['adapterFactory']>>[0]
type Environment=Record<string,string|undefined>
/** Request-bound SOURCE wiring. Gates and private RPC are lazy; this does not
 * seed quota, apply SQL, install credentials or grant transmission approval.
 */
export function createRequestBoundCostExtractionAdapter(value:FactoryInput,options:{environment?:Environment;rpcFactory:()=>AzureF0PrivateRpc}):CostExtractionAdapter{
 const environment=options.environment??process.env
 if(environment.TASKOVIA_COST_OCR_AZURE_ENABLED!=='true'||environment.TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED!=='true'||!readAzureF0ServerConfiguration(environment).enabled)return createCostExtractionAdapter()
 const {context,target,input,refresh}=value
 if(target.sizeBytes===undefined)return createCostExtractionAdapter()
 const expected:Readonly<AzureF0RequestAccess>=Object.freeze({actorId:context.actorId,tenantId:context.tenantId,companyId:context.companyId,projectId:target.projectId,
  fileId:target.fileId,fileVersion:target.fileVersion,requestId:target.requestId,requestVersion:target.requestVersion,sha256:target.sha256,mimeType:target.mimeType,sizeBytes:target.sizeBytes,permissions:Object.freeze([...context.permissions])})
 const projectMetadata=(access:Readonly<AzureF0RequestAccess>):AzureF0DocumentMetadata=>({tenantId:access.tenantId,companyId:access.companyId,projectId:access.projectId,fileId:access.fileId,fileVersion:access.fileVersion,sha256:access.sha256,mimeType:access.mimeType,sizeBytes:access.sizeBytes})
 const metadata=Object.freeze(projectMetadata(expected))
 const readAccess=async():Promise<Readonly<AzureF0RequestAccess>|null>=>{
  try{
   // refresh checks the current bearer, tenancy, all permissions and exact target/revisions.
   const fresh=await refresh(),observed=await fresh.repository.readTarget(fresh.context,target.projectId,target.requestId,target.fileId)
   if(observed.sizeBytes===undefined||observed.documentKind!==target.documentKind)return null
   return {...observed,sizeBytes:observed.sizeBytes,actorId:fresh.context.actorId,tenantId:fresh.context.tenantId,permissions:fresh.context.permissions}
  }catch{return null}
 }
 const authorizeAccess=createAzureF0RequestAuthorizer(expected,readAccess)
 const authorize:typeof authorizeAccess=async(candidate)=>candidate.documentKind===(target.documentKind??undefined)&&await authorizeAccess(candidate)
 const readMetadata=async()=>{if(!await authorize(input))return null;return metadata}
 const sourcePageCount=Object.freeze(input.pdfSourcePageCount?{...input.pdfSourcePageCount}:{kind:'unknown' as const})
 const pdfPageScope=input.pdfPageScope
 const admitPdf=createAzureF0PdfAdmission(metadata,async()=>!pdfPageScope||!await authorize(input)?null:{metadata,pdfPageScope,sourcePageCount})
 let privateRpc:AzureF0PrivateRpc|undefined
 const rpc:AzureF0PrivateRpc=(name,args)=>{privateRpc??=options.rpcFactory();return privateRpc(name,args)}
 const store=createAzureF0JobStore({binding:{actorId:expected.actorId,tenantId:expected.tenantId,companyId:expected.companyId,projectId:expected.projectId,
  fileId:expected.fileId,fileVersion:expected.fileVersion,requestId:expected.requestId,requestVersion:expected.requestVersion,sha256:expected.sha256},rpc,authorize:()=>authorize(input)})
 return createCostExtractionAdapter({environment,azure:{store,authorize,inspect:createAzureF0ImageDocumentInspector(metadata,readMetadata),admitPdf}})
}
