import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseOpportunityRepository } from '../../../server/features/opportunities/opportunity.repository'
import { createOpportunityRoutes } from '../../../server/features/opportunities/opportunity.routes'
import { createOpportunityService } from '../../../server/features/opportunities/opportunity.service'
import { runApiRoute } from '../../../server/utils/api-error'

const { getRouterParam, readBody, setResponseStatus } = vi.hoisted(() => ({
  getRouterParam: vi.fn(), readBody: vi.fn(), setResponseStatus: vi.fn(),
}))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody, setResponseStatus,
}))

const companyId = '71000000-0000-4000-8000-000000000020'
const opportunityId = '71000000-0000-4000-8000-000000000030'
const contactId = '71000000-0000-4000-8000-000000000031'
const scopeId = '71000000-0000-4000-8000-000000000032'
const context = { actorId: '71000000-0000-4000-8000-000000000001', tenantId: '71000000-0000-4000-8000-000000000010',
  companyId, permissions: [], requestId: '71000000-0000-4000-8000-000000000099' }

describe('Stage 01 Opportunity routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, opportunityId, contactId, scopeId })[name])
  })

  it('returns the stable HTTP 400 contract when a dynamic taxonomy code is unknown', async () => {
    readBody.mockResolvedValue({
      primaryLeadSourceCode: 'unknown-code',
      expectedOpportunityVersion: 1,
    })
    const service = createOpportunityService(createSupabaseOpportunityRepository({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'INVALID_COMMAND_INPUT',
          details: 'primaryLeadSourceCode=unknown-code',
        },
      }),
    } as never))
    const event = { context: { requestId: context.requestId } }
    const routes = createOpportunityRoutes({
      resolveContext: vi.fn().mockResolvedValue({
        ...context,
        permissions: ['opportunity.update'],
      }),
      service,
    })

    await expect(runApiRoute(event as never, () => routes.update(event))).resolves.toEqual({
      error: {
        code: 'OPPORTUNITY_INVALID',
        message: 'Dữ liệu Opportunity không hợp lệ.',
        requestId: context.requestId,
        details: {},
      },
    })
    expect(setResponseStatus).toHaveBeenCalledWith(event, 400)
  })

  it('forwards only strict server-scoped create input', async () => {
    readBody.mockResolvedValue({ primaryCustomerName: 'VQH Lead' })
    const create = vi.fn().mockResolvedValue({ opportunityId })
    const resolveContext = vi.fn().mockResolvedValue(context)
    await createOpportunityRoutes({ resolveContext, service: { create } as never }).create({})
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(create).toHaveBeenCalledWith(context, { primaryCustomerName: 'VQH Lead' })
  })

  it('forwards the company-scoped create-options request without a client body', async () => {
    const getCreateOptions = vi.fn().mockResolvedValue({ workflowKey: 'vqh.stage01' })
    const resolveContext = vi.fn().mockResolvedValue(context)
    await createOpportunityRoutes({ resolveContext, service: { getCreateOptions } as never }).getCreateOptions({})
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(getCreateOptions).toHaveBeenCalledWith(context)
  })

  it.each(['companyId', 'tenantId', 'actorId', 'permissions', 'decisionAuthorityUserId'])(
    'rejects client-supplied scope field %s', async field => {
    readBody.mockResolvedValue({ primaryCustomerName: 'VQH Lead', [field]: companyId })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const create = vi.fn()
    await expect(createOpportunityRoutes({ resolveContext, service: { create } as never }).create({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(create).not.toHaveBeenCalled()
    },
  )

  it('rejects nested aggregate writes on generic Opportunity PATCH', async () => {
    readBody.mockResolvedValue({ expectedOpportunityVersion: 0, contacts: [{ id: contactId }] })
    const update = vi.fn()
    await expect(createOpportunityRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { update } as never }).update({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(update).not.toHaveBeenCalled()
  })

  it('parses resource IDs and forwards one bounded Scope command', async () => {
    readBody.mockResolvedValue({ scopeCode: 'design', expectedOpportunityVersion: 2 })
    const addScope = vi.fn().mockResolvedValue({ id: scopeId })
    await createOpportunityRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { addScope } as never }).addScope({})
    expect(addScope).toHaveBeenCalledWith(context, opportunityId, { scopeCode: 'design', expectedOpportunityVersion: 2 })
  })

  it('forwards optional duplicate-separation evidence on restore', async () => {
    const input = {
      reason: 'Duplicate relationship separated',
      evidence: [{ kind: 'separation_record', ref: 'case:42' }],
      expectedOpportunityVersion: 5,
    }
    readBody.mockResolvedValue(input)
    const restore = vi.fn()
    await createOpportunityRoutes({
      resolveContext: vi.fn().mockResolvedValue(context),
      service: { restore } as never,
    }).restore({})
    expect(restore).toHaveBeenCalledWith(context, opportunityId, input)
  })

  it('rejects malformed IDs before context resolution', async () => {
    getRouterParam.mockImplementation((_event, name: string) => name === 'companyId' ? companyId : 'not-a-uuid')
    const resolveContext = vi.fn()
    await expect(createOpportunityRoutes({ resolveContext, service: {} as never }).get({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
  })
})
