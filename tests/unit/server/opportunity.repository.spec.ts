import { describe, expect, it, vi } from 'vitest'
import { createSupabaseOpportunityRepository } from '../../../server/features/opportunities/opportunity.repository'

const companyId = '61000000-0000-4000-8000-000000000020'
const requestId = '61000000-0000-4000-8000-000000000021'

describe('Stage 01 Opportunity repository', () => {
  it('calls only the explicit bootstrap RPC with server scope and parses its response', async () => {
    const data = {
      opportunityId: '61000000-0000-4000-8000-000000000030',
      workflowInstanceId: '61000000-0000-4000-8000-000000000031',
      intakeNodeInstanceId: '61000000-0000-4000-8000-000000000032',
      intakeExecutionId: '61000000-0000-4000-8000-000000000033',
      evaluationNodeInstanceId: '61000000-0000-4000-8000-000000000034',
      evaluationExecutionId: '61000000-0000-4000-8000-000000000035',
      decisionCycleId: '61000000-0000-4000-8000-000000000036',
      opportunityVersion: 0,
      intakeExecutionVersion: 0,
      evaluationExecutionVersion: 0,
      decisionCycleVersion: 0,
    }
    const rpc = vi.fn().mockResolvedValue({ data, error: null })
    const repository = createSupabaseOpportunityRepository({ rpc } as never)

    await expect(repository.create(companyId, { primaryCustomerName: 'VQH Lead' }, requestId))
      .resolves.toEqual(data)
    expect(rpc).toHaveBeenCalledWith('create_stage01_opportunity', {
      target_company_id: companyId,
      target_input: { primaryCustomerName: 'VQH Lead' },
      target_request_id: requestId,
    })
  })

  it('fails closed on a malformed RPC response', async () => {
    const repository = createSupabaseOpportunityRepository({
      rpc: vi.fn().mockResolvedValue({ data: { opportunityId: 'not-a-uuid' }, error: null }),
    } as never)
    await expect(repository.create(companyId, { primaryCustomerName: 'VQH Lead' }, requestId))
      .rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })
})
