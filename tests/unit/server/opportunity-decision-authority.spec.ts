import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'
import { createHttpStage01Repository } from '../../../app/repositories/http/http-stage01-repository'
import { createStage01Routes } from '../../../server/features/stage01/stage01.routes'
import { createSupabaseStage01Repository } from '../../../server/features/stage01/stage01.repository'
import { mapStage01RpcError } from '../../../server/features/stage01/stage01-errors'
import { createStage01Service } from '../../../server/features/stage01/stage01.service'

const { getRouterParam, readBody } = vi.hoisted(() => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody }))

const companyId = '94000000-0000-4000-8000-000000000020'
const opportunityId = '94000000-0000-4000-8000-000000000030'
const cycleId = '94000000-0000-4000-8000-000000000040'
const actorId = '94000000-0000-4000-8000-000000000001'
const context = { actorId, tenantId: '94000000-0000-4000-8000-000000000010', companyId, permissions: ['opportunity.decision_authority.assign'] as const, requestId: '94000000-0000-4000-8000-000000000099' }
const assignment = { requestId: '94000000-0000-4000-8000-000000000050', action: 'assign' as const, authorityUserId: actorId, expectedCycleVersion: 4, reason: null }

describe('Opportunity Decision Authority server boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, opportunityId, decisionCycleId: cycleId })[name])
  })

  it('rejects assignment before the canonical authority permission reaches the repository', async () => {
    const assignDecisionAuthority = vi.fn()
    const service = createStage01Service({ assignDecisionAuthority } as never)
    await expect(service.assignDecisionAuthority({ ...context, permissions: [] }, opportunityId, cycleId, assignment))
      .rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' })
    expect(assignDecisionAuthority).not.toHaveBeenCalled()
  })

  it('forwards only route-scoped authority assignment data to the service', async () => {
    readBody.mockResolvedValue(assignment)
    const assignDecisionAuthority = vi.fn()
    await createStage01Routes({ resolveContext: vi.fn().mockResolvedValue(context), service: { assignDecisionAuthority } as never })
      .assignDecisionAuthority({})
    expect(assignDecisionAuthority).toHaveBeenCalledWith(context, opportunityId, cycleId, assignment)
  })

  it('uses company/opportunity/cycle scoped RPC arguments for authority candidates', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [{ userId: actorId, employeeId: '94000000-0000-4000-8000-000000000002', displayName: 'Eligible actor', positionTitle: null }] }, error: null })
    const repository = createSupabaseStage01Repository({ rpc } as never)
    await expect(repository.listDecisionAuthorityCandidates(companyId, opportunityId, cycleId)).resolves.toEqual([{
      userId: actorId, employeeId: '94000000-0000-4000-8000-000000000002', displayName: 'Eligible actor', positionTitle: null,
    }])
    expect(rpc).toHaveBeenCalledWith('list_opportunity_decision_authority_candidates', {
      target_company_id: companyId, target_opportunity_id: opportunityId, target_cycle_id: cycleId,
    })
  })

  it('keeps authority candidate routes compatible with the HTTP repository envelope', async () => {
    const candidates = [{ userId: actorId, employeeId: '94000000-0000-4000-8000-000000000002', displayName: 'Eligible actor', positionTitle: null }]
    const service = createStage01Service({
      listDecisionAuthorityCandidates: vi.fn().mockResolvedValue(candidates),
    } as never)
    const route = createStage01Routes({ resolveContext: vi.fn().mockResolvedValue(context), service })
    const client = createAuthenticatedHttpClient({
      getAccessToken: () => 'test-token',
      fetch: async () => new Response(JSON.stringify(await route.listDecisionAuthorityCandidates({})), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    })
    const repository = createHttpStage01Repository({ companyId, client })

    await expect(repository.listDecisionAuthorityCandidates(opportunityId, cycleId)).resolves.toEqual(candidates)
  })

  it('maps scoped idempotency conflicts without exposing a database error', () => {
    expect(() => mapStage01RpcError({ code: 'P0001', message: 'IDEMPOTENCY_CONFLICT' }, 'fallback'))
      .toThrow(expect.objectContaining({ statusCode: 409, code: 'IDEMPOTENCY_CONFLICT' }))
  })

  it('maps disabled-company authority commands to a domain error', () => {
    expect(() => mapStage01RpcError({ code: 'P0001', message: 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED' }, 'fallback'))
      .toThrow(expect.objectContaining({ statusCode: 409, code: 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED' }))
  })
})
