import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStage01Routes } from '../../../server/features/stage01/stage01.routes'

const { getRouterParam, readBody } = vi.hoisted(() => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody,
}))

const companyId = '73000000-0000-4000-8000-000000000020'
const opportunityId = '73000000-0000-4000-8000-000000000030'
const criterionKey = 'customer_need.fit'
const context = { actorId: '73000000-0000-4000-8000-000000000001', tenantId: '73000000-0000-4000-8000-000000000010',
  companyId, permissions: [], requestId: '73000000-0000-4000-8000-000000000099' }

describe('Stage 01 decision routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, opportunityId, criterionKey })[name])
  })

  it('forwards a criterion revision with a bounded criterion key', async () => {
    const input = { expectedCycleVersion: 0, applicability: 'applicable', result: 'fit', rationale: 'Fits', evidence: [] }
    readBody.mockResolvedValue(input)
    const evaluateCriterion = vi.fn()
    await createStage01Routes({ resolveContext: vi.fn().mockResolvedValue(context), service: { evaluateCriterion } as never }).evaluateCriterion({})
    expect(evaluateCriterion).toHaveBeenCalledWith(context, opportunityId, criterionKey, input)
  })

  it.each(['companyId', 'tenantId', 'actorId', 'permissions', 'decisionAuthorityUserId', 'authorityResolutionReference'])(
    'rejects client-supplied authority/scope field %s', async field => {
    readBody.mockResolvedValue({ expectedCycleVersion: 0, outcome: 'proceed', rationale: 'Approved', [field]: context.actorId })
    const recordFinalDecision = vi.fn()
    await expect(createStage01Routes({ resolveContext: vi.fn().mockResolvedValue(context), service: { recordFinalDecision } as never }).recordFinalDecision({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(recordFinalDecision).not.toHaveBeenCalled()
    },
  )

  it('preserves a stable service conflict without translating business behavior', async () => {
    readBody.mockResolvedValue({ expectedCycleVersion: 1, recommendation: 'recommend_proceed', rationale: 'Ready', evidence: [] })
    const error = { statusCode: 409, code: 'VERSION_CONFLICT' }
    const submitRecommendation = vi.fn().mockRejectedValue(error)
    await expect(createStage01Routes({ resolveContext: vi.fn().mockResolvedValue(context), service: { submitRecommendation } as never }).submitRecommendation({}))
      .rejects.toBe(error)
  })
})
