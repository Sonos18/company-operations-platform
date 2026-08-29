import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpportunityRoutes } from '../../../server/features/opportunities/opportunity.routes'

const { getRouterParam, readBody } = vi.hoisted(() => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody,
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

  it('forwards only strict server-scoped create input', async () => {
    readBody.mockResolvedValue({ primaryCustomerName: 'VQH Lead' })
    const create = vi.fn().mockResolvedValue({ opportunityId })
    const resolveContext = vi.fn().mockResolvedValue(context)
    await createOpportunityRoutes({ resolveContext, service: { create } as never }).create({})
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
    expect(create).toHaveBeenCalledWith(context, { primaryCustomerName: 'VQH Lead' })
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

  it('rejects malformed IDs before context resolution', async () => {
    getRouterParam.mockImplementation((_event, name: string) => name === 'companyId' ? companyId : 'not-a-uuid')
    const resolveContext = vi.fn()
    await expect(createOpportunityRoutes({ resolveContext, service: {} as never }).get({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), companyId)
  })
})
