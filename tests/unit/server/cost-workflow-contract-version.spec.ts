import {expect,it} from 'vitest'
import {workflowContractViewSchema} from '../../../shared/schemas/costs/cost-workflow'
const id='c1f50000-0000-4000-8000-000000000001',versionId='c1f50000-0000-4000-8000-000000000002'
it('requires the immutable contract version identity for request selection, independently of its contract identity',()=>{const view={id,versionId,partyId:id,reference:'Synthetic quote',currencyCode:'VND',version:1,cap:'100',evidenceFileIds:[id],sourceSubcontractId:null};expect(workflowContractViewSchema.parse(view).versionId).toBe(versionId);expect(workflowContractViewSchema.safeParse({...view,versionId:undefined}).success).toBe(false)})
