import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { CostWorkflowService } from '../../../server/features/costs/workflow/cost-workflow.service'
import { SupabaseWorkflowRepository } from '../../../server/features/costs/workflow/cost-workflow.repository'
import { createCostWorkflowRoutes } from '../../../server/features/costs/workflow/cost-workflow.routes'
import { createHttpCostWorkflowRepository } from '../../../app/repositories/http/http-cost-workflow-repository'
vi.mock('h3', () => ({ getRouterParam: (e: H3Event, key: string) => e.context.params?.[key], getHeader: () => undefined }))
const company='c1f50000-0000-4000-8000-000000000001', project='c1f50000-0000-4000-8000-000000000002', id='c1f50000-0000-4000-8000-000000000003'
const context={companyId:company,tenantId:company,actorId:id,requestId:id,permissions:['cost.request.read','cost.request.submit','cost.prepare'] as const}
const option={id,partyId:id,code:'SUB-01',contractName:'Synthetic subcontract',currencyCode:'VND'}
describe('source subcontract mapping read boundary', () => {
  it.each(['cost.request.read','cost.request.submit','cost.prepare'])('denies without %s before RPC', async permission => {
    const listSourceSubcontracts=vi.fn()
    const service=new CostWorkflowService({listSourceSubcontracts} as never)
    await expect(service.listSourceSubcontracts({...context,permissions:context.permissions.filter(p=>p!==permission)},project)).rejects.toMatchObject({statusCode:403})
    expect(listSourceSubcontracts).not.toHaveBeenCalled()
  })
  it('validates project identity and preserves trusted company scope', async () => {
    const listSourceSubcontracts=vi.fn(async()=>[option]), service=new CostWorkflowService({listSourceSubcontracts} as never)
    await expect(service.listSourceSubcontracts(context,'foreign-text')).rejects.toMatchObject({statusCode:400})
    expect(listSourceSubcontracts).not.toHaveBeenCalled()
    expect(await service.listSourceSubcontracts(context,project)).toEqual([option])
    expect(listSourceSubcontracts).toHaveBeenCalledWith(context,project)
  })
  it('uses only the user-bound scoped read RPC and rejects extra response fields', async () => {
    const rpc=vi.fn(async (_name:string,_args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>=>({data:[option],error:null})), repository=new SupabaseWorkflowRepository({rpc} as never)
    expect(await repository.listSourceSubcontracts(context,project)).toEqual([option])
    expect(rpc).toHaveBeenCalledWith('c1_workflow_list_source_subcontracts',{target_company_id:company,target_project_id:project})
    rpc.mockResolvedValueOnce({data:[{...option,actorId:id}],error:null})
    await expect(repository.listSourceSubcontracts(context,project)).rejects.toMatchObject({statusCode:500})
  })
  it('rejects malformed route scope before a read and forwards the resolved scope', async () => {
    const listSourceSubcontracts=vi.fn(async()=>[option]), routes=createCostWorkflowRoutes({resolveContext:vi.fn(async()=>context),service:{listSourceSubcontracts} as never})
    const event=(p:string)=>({context:{params:{companyId:company,projectId:p}}}) as unknown as H3Event
    await expect(routes.listSourceSubcontracts(event('bad'))).rejects.toMatchObject({statusCode:400})
    expect(listSourceSubcontracts).not.toHaveBeenCalled()
    await routes.listSourceSubcontracts(event(project))
    expect(listSourceSubcontracts).toHaveBeenCalledWith(context,project)
  })
  it('validates canonical mapping identity before creating a basis and forwards only the approved input', async () => {
    const createContractBasis=vi.fn(), service=new CostWorkflowService({createContractBasis} as never)
    const input={partyId:id,reference:'Synthetic contract',referenceAmount:'100',currencyCode:'VND',evidenceFileIds:[id],sourceSubcontractId:id}
    await expect(service.createContractBasis(context,project,{...input,sourceSubcontractId:'bad'},id)).rejects.toMatchObject({statusCode:400})
    await expect(service.createContractBasis(context,project,{...input,companyId:company},id)).rejects.toMatchObject({statusCode:400})
    expect(createContractBasis).not.toHaveBeenCalled()
    await service.createContractBasis(context,project,input,id)
    expect(createContractBasis).toHaveBeenCalledWith(context,project,input,id)
  })
  it('uses a scoped GET without sending actor, cap or mutation payload', async () => {
    const request=vi.fn(async (_input:unknown)=>[option])
    const repository=createHttpCostWorkflowRepository({companyId:company,client:{request} as never})
    await repository.listSourceSubcontracts(project)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({url:'/api/companies/'+company+'/projects/'+project+'/cost-workflow/source-subcontracts',method:'GET'}))
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty('body')
  })
})
