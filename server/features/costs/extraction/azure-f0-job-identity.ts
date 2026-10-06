import {createHash} from 'node:crypto'
import type {AzureF0PdfPageScope,CostExtractionInput} from '../../../../shared/schemas/costs/cost-extraction'
export interface AzureF0Reservation{
 key:string;resourceId:string;month:string;pages:number;limit:number;scope:CostExtractionInput['scope'];
 fileId:string;sha256:string;model:'prebuilt-invoice'|'prebuilt-layout';configurationVersion:string;pdfPageScope?:AzureF0PdfPageScope
}
/** Preserve existing image identities. Explicit PDF prefixes occupy a new namespace.
 * SQL mirrors this exact JSON array; unknown prior sends block across namespaces.
 */
export function azureF0ReservationKey(value:Omit<AzureF0Reservation,'key'|'month'|'limit'>):string{
 const fields:unknown[]=[value.resourceId,value.configurationVersion,value.scope.companyId,value.scope.projectId,value.fileId,value.sha256,value.model]
 if(value.pdfPageScope){
  if(!['1','1-2'].includes(value.pdfPageScope)||value.pages!==(value.pdfPageScope==='1'?1:2))throw new Error('AZURE_STORE_INPUT_INVALID')
  fields.push('azure-pdf-scope-v1',value.pdfPageScope)
 }
 return createHash('sha256').update(JSON.stringify(fields)).digest('hex')
}
