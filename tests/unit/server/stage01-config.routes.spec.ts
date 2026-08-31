import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStage01ConfigRoutes } from '../../../server/features/stage01-config/stage01-config.routes'
import { businessTaxonomies, context, criteria, ids } from './stage01-config.fixture'

const { getRouterParam, readBody } = vi.hoisted(() => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody }))

describe('Stage 01 configuration routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockReturnValue(ids.company)
  })

  it('uses the route company context and does not accept client actor or request scope', async () => {
    readBody.mockResolvedValue({ expectedPublishedSnapshotId: ids.snapshot, actorId: ids.actor })
    const resolveContext = vi.fn().mockResolvedValue(context)
    const createDraft = vi.fn()
    const routes = createStage01ConfigRoutes({ resolveContext, service: { createDraft } as never })

    await expect(routes.createDraft({})).rejects.toMatchObject({ statusCode: 400, code: 'COMPANY_CONTEXT_REQUIRED' })
    expect(resolveContext).toHaveBeenCalledWith(expect.anything(), ids.company)
    expect(createDraft).not.toHaveBeenCalled()
  })

  it.each(['tenantId', 'companyId', 'permissions', 'requestId', 'workflowKey', 'semanticKey', 'definition', 'nodes'])(
    'rejects system or server-owned update field %s', async field => {
      readBody.mockResolvedValue({
        expectedDraftVersion: 0,
        taxonomies: businessTaxonomies,
        criteria,
        [field]: field === 'semanticKey' ? 'reserved' : [],
      })
      const updateDraft = vi.fn()
      await expect(createStage01ConfigRoutes({
        resolveContext: vi.fn().mockResolvedValue(context), service: { updateDraft } as never,
      }).updateDraft({})).rejects.toMatchObject({ statusCode: 400 })
      expect(updateDraft).not.toHaveBeenCalled()
    },
  )

  it('rejects nested semantic identity from a draft update body', async () => {
    readBody.mockResolvedValue({
      expectedDraftVersion: 0,
      taxonomies: {
        ...businessTaxonomies,
        customer_type: [{ code: 'customer', label: 'Customer', semanticKey: 'reserved' }],
      },
      criteria,
    })
    const updateDraft = vi.fn()
    await expect(createStage01ConfigRoutes({
      resolveContext: vi.fn().mockResolvedValue(context), service: { updateDraft } as never,
    }).updateDraft({})).rejects.toMatchObject({ statusCode: 400 })
    expect(updateDraft).not.toHaveBeenCalled()
  })

  it('passes the strict discard body through the one resolved server context', async () => {
    readBody.mockResolvedValue({ expectedDraftVersion: 0 })
    const discardDraft = vi.fn()
    const routes = createStage01ConfigRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { discardDraft } as never })

    await routes.discardDraft({})

    expect(discardDraft).toHaveBeenCalledWith(context, { expectedDraftVersion: 0 })
  })
})
