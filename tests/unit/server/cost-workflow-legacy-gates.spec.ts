import {describe,expect,it,vi} from 'vitest'
import {ProjectFinanceWriteRepository} from '../../../server/features/costs/finance/project-finance-write.repository'
import {workflowEvidenceTargetSchema} from '../../../shared/schemas/costs/cost-workflow-evidence'
const id='c1f50000-0000-4000-8000-000000000001'
describe('workflow cutover boundaries',()=>{
 it('exposes a legacy disabled conflict from raw old payment RPC without retrying a new cash event',async()=>{const rpc=vi.fn(async()=>({data:null,error:{message:'LEGACY_WORKFLOW_WRITE_DISABLED'}}));await expect(new ProjectFinanceWriteRepository({rpc} as never).recordPayment({companyId:id,requestId:id},id,id,{expectedSubcontractVersion:0,description:'old transfer',paidAmount:'10',currencyCode:'VND'},id)).rejects.toMatchObject({statusCode:409,code:'LEGACY_WORKFLOW_WRITE_DISABLED'});expect(rpc).toHaveBeenCalledTimes(1)})
 it('stages refund proof against a known payment before the adjustment exists',()=>{expect(workflowEvidenceTargetSchema.parse({kind:'adjustment',sourcePaymentId:id})).toEqual({kind:'adjustment',sourcePaymentId:id})})
 it('rejects ambiguous or missing adjustment targets',()=>{expect(workflowEvidenceTargetSchema.safeParse({kind:'adjustment'}).success).toBe(false);expect(workflowEvidenceTargetSchema.safeParse({kind:'adjustment',id,sourcePaymentId:id}).success).toBe(false)})
})
