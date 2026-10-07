import {AzureF0CostExtractionAdapter,AzureDocumentIntelligenceTransport,azureF0Endpoint,type AzureF0Options} from './azure-f0-cost-extraction'
import {OfflineCostExtractionAdapter} from './cost-extraction-adapter'
type Environment=Record<string,string|undefined>
type ServerConfiguration={enabled:false}|{enabled:true;config:{enabled:true;sku:'F0';transmissionApproved:true;resourceId:string;endpoint:string;version:string;monthlyPageBudget:number};credential:()=>string}
/** Server-only process environment. No Nuxt public config or browser input.
 * Enabling an endpoint/key alone is insufficient: both explicit gates and approved
 * persistent quota/jobs, trusted inspection or scoped PDF admission and fresh authorization are required.
 */
export function readAzureF0ServerConfiguration(environment:Environment):ServerConfiguration{
 if(environment.TASKOVIA_COST_OCR_AZURE_ENABLED!=='true'||environment.TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED!=='true')return {enabled:false}
 if((environment.TASKOVIA_COST_OCR_AZURE_SKU??'F0')!=='F0')return {enabled:false}
 const rawBudget=environment.TASKOVIA_COST_OCR_AZURE_MONTHLY_PAGE_BUDGET??'500'
 if(!/^[1-9]\d{0,2}$/.test(rawBudget)||Number(rawBudget)>500)return {enabled:false}
 const rawEndpoint=environment.TASKOVIA_COST_OCR_AZURE_ENDPOINT
 if(!rawEndpoint||!environment.TASKOVIA_COST_OCR_AZURE_API_KEY?.trim())return {enabled:false}
 try{
  const url=new URL(azureF0Endpoint(rawEndpoint))
  return {enabled:true,config:{enabled:true,sku:'F0',transmissionApproved:true,resourceId:url.hostname,endpoint:url.origin,version:'azure-f0-rest-2024-11-30-quotation-v2',monthlyPageBudget:Number(rawBudget)},credential:()=>environment.TASKOVIA_COST_OCR_AZURE_API_KEY??''}
 }catch{return {enabled:false}}
}
export function createCostExtractionAdapter(options:{environment?:Environment;azure?:Pick<AzureF0Options,'store'|'inspect'|'authorize'|'now'|'admitPdf'>}={}){
 // Deliberately fail closed until the approved durable integration exists.
 // Do not even read the credential in this unwired runtime path.
 if(!options.azure)return new OfflineCostExtractionAdapter()
 const configured=readAzureF0ServerConfiguration(options.environment??process.env)
 if(!configured.enabled)return new OfflineCostExtractionAdapter()
 return new AzureF0CostExtractionAdapter({...options.azure,config:configured.config,transport:new AzureDocumentIntelligenceTransport(configured.config.endpoint,configured.credential)})
}
