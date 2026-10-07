import {describe,expect,it,vi} from 'vitest'
import {CostWorkflowReportingService} from '../../../server/features/costs/finance/cost-workflow-reporting.service'
import {SupabaseWorkflowReportingRepository} from '../../../server/features/costs/finance/cost-workflow-reporting.repository'
import type {UserSupabaseClient} from '../../../server/utils/supabase-client'
const id='c1f50000-0000-4000-8000-000000000001'
const context={companyId:id,tenantId:id,actorId:id,requestId:id,permissions:['cost.request.read'] as const}
const repository=()=>({readWorkflowCash:vi.fn(),readInventory:vi.fn(),reconcileLegacyCash:vi.fn()})
describe('scoped reporting and historical review boundary',()=>{
 it('does not let legacy cost.read open new workflow reports or payroll scope',async()=>{const r=repository();await expect(new CostWorkflowReportingService(r).readWorkflowCash({...context,permissions:['cost.read']},id)).rejects.toMatchObject({statusCode:403});expect(r.readWorkflowCash).not.toHaveBeenCalled()})
 it('delegates the current user and project scope without company-wide legacy reporting',async()=>{const r=repository();await new CostWorkflowReportingService(r).readWorkflowCash(context,id);expect(r.readWorkflowCash).toHaveBeenCalledWith(context,id)})
 it('requires both accountant cash and explicit historical coverage authority',async()=>{const r=repository();await expect(new CostWorkflowReportingService(r).reconcileLegacyCash({...context,permissions:['cost.record_cash']},id,{},id)).rejects.toMatchObject({statusCode:403});expect(r.reconcileLegacyCash).not.toHaveBeenCalled()})
 it('rejects browser historical actor/approval/authority fabrication',async()=>{const r=repository();const value={legacyKind:'ordinary_detail',legacyId:id,actualOutgoing:'0',actualPaymentDate:null,evidenceFileIds:[id],reason:'Reviewed zero',expectedLegacyHash:'a'.repeat(64),approvedBy:id};await expect(new CostWorkflowReportingService(r).reconcileLegacyCash({...context,permissions:['cost.record_cash','cost.coverage.assert']},id,value,id)).rejects.toMatchObject({statusCode:400});expect(r.reconcileLegacyCash).not.toHaveBeenCalled()})
 it('rejects malformed or unknown RPC data rather than render an asserted cash total',async()=>{const rpc=vi.fn().mockResolvedValue({error:null,data:{grossPaid:'100'}});await expect(new SupabaseWorkflowReportingRepository({rpc} as unknown as UserSupabaseClient).readWorkflowCash(context,id)).rejects.toMatchObject({statusCode:500});expect(rpc).toHaveBeenCalledWith('c1_workflow_cash_snapshot',{target_company_id:id,target_project_id:id})})
})
