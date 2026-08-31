import { describe, expect, it, vi } from 'vitest'
import { createSupabaseOpportunityRepository } from '../../../server/features/opportunities/opportunity.repository'

const companyId = '61000000-0000-4000-8000-000000000020'
const requestId = '61000000-0000-4000-8000-000000000021'
const opportunityId = '61000000-0000-4000-8000-000000000030'

describe('Stage 01 Opportunity repository', () => {
  it('calls only the narrow create-options RPC and rejects a widened payload', async () => {
    const data = {
      workflowKey: 'vqh.stage01',
      publishedSnapshotId: '61000000-0000-4000-8000-000000000050',
      taxonomies: {
        customer_type: [{ code: 'customer', label: 'Khách hàng' }],
        lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: true } }],
        engagement_status: [{ code: 'active', label: 'Đang trao đổi' }],
        budget_status: [{ code: 'unknown', label: 'Chưa xác định' }],
        timeline_status: [{ code: 'unknown', label: 'Chưa xác định' }],
        priority: [{ code: 'normal', label: 'Bình thường' }],
      },
    }
    const rpc = vi.fn().mockResolvedValue({ data, error: null })
    const repository = createSupabaseOpportunityRepository({ rpc } as never)

    await expect(repository.getCreateOptions(companyId)).resolves.toEqual(data)
    expect(rpc).toHaveBeenCalledWith('get_stage01_opportunity_create_options', { target_company_id: companyId })

    rpc.mockResolvedValueOnce({ data: { ...data, draft: {} }, error: null })
    await expect(repository.getCreateOptions(companyId)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('calls only the explicit bootstrap RPC with server scope and parses its response', async () => {
    const data = {
      opportunityId,
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

  it('forwards duplicate-separation evidence to the fixed restore RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { opportunityId, validityState: 'valid', opportunityVersion: 6 },
      error: null,
    })
    const repository = createSupabaseOpportunityRepository({ rpc } as never)
    const input = {
      reason: 'Duplicate relationship separated',
      evidence: [{ kind: 'separation_record', ref: 'case:42' }],
      expectedOpportunityVersion: 5,
    }
    await repository.restore(companyId, opportunityId, input, requestId)
    expect(rpc).toHaveBeenCalledWith('restore_opportunity', {
      target_company_id: companyId,
      target_opportunity_id: opportunityId,
      target_input: input,
      target_request_id: requestId,
    })
  })

  it('maps the private INVALID_COMMAND_INPUT taxonomy boundary to the stable 400 contract', async () => {
    const repository = createSupabaseOpportunityRepository({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'INVALID_COMMAND_INPUT',
          details: 'primaryLeadSourceCode=unknown-code',
        },
      }),
    } as never)

    await expect(repository.update(companyId, opportunityId, {
      primaryLeadSourceCode: 'unknown-code',
      expectedOpportunityVersion: 1,
    }, requestId)).rejects.toMatchObject({
      statusCode: 400,
      code: 'OPPORTUNITY_INVALID',
      details: {},
    })
  })

  it('keeps an unrecognized private P0001 error on the sanitized 500 fallback', async () => {
    const repository = createSupabaseOpportunityRepository({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'UNEXPECTED_PRIVATE_DIAGNOSTIC',
          details: 'secret database detail',
        },
      }),
    } as never)

    await expect(repository.update(companyId, opportunityId, {
      primaryLeadSourceCode: 'unknown-code',
      expectedOpportunityVersion: 1,
    }, requestId)).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      details: {},
    })
  })
})
