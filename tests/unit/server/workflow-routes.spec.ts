import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowRoutes } from '../../../server/features/workflow/workflow.routes'

const { getRouterParam, readBody } = vi.hoisted(() => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getRouterParam, readBody,
}))

const companyId = '72000000-0000-4000-8000-000000000020'
const nodeExecutionId = '72000000-0000-4000-8000-000000000030'
const assignmentId = '72000000-0000-4000-8000-000000000031'
const blockerId = '72000000-0000-4000-8000-000000000032'
const context = { actorId: '72000000-0000-4000-8000-000000000001', tenantId: '72000000-0000-4000-8000-000000000010',
  companyId, permissions: [], requestId: '72000000-0000-4000-8000-000000000099' }

describe('Stage 01 Workflow routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockImplementation((_event, name: string) => ({ companyId, nodeExecutionId, assignmentId, blockerId })[name])
  })

  it('keeps generic complete dispatch in the service boundary', async () => {
    const input = { expectedExecutionVersion: 1, expectedOpportunityVersion: 2 }
    readBody.mockResolvedValue(input)
    const completeNode = vi.fn().mockResolvedValue({ nodeExecutionId })
    await createWorkflowRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { completeNode } as never }).completeNode({})
    expect(completeNode).toHaveBeenCalledWith(context, nodeExecutionId, input)
  })

  it('forwards an assignment body without client-controlled scope', async () => {
    const input = { assignmentKind: 'accountable_owner', assigneeUserId: context.actorId, expectedExecutionVersion: 0 }
    readBody.mockResolvedValue(input)
    const assign = vi.fn()
    await createWorkflowRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { assign } as never }).assign({})
    expect(assign).toHaveBeenCalledWith(context, nodeExecutionId, input)
  })

  it.each(['companyId', 'tenantId', 'actorId', 'permissions', 'authorityRule'])(
    'rejects client-supplied field %s on mutation bodies', async field => {
    readBody.mockResolvedValue({ expectedExecutionVersion: 0, [field]: companyId })
    const startNode = vi.fn()
    await expect(createWorkflowRoutes({ resolveContext: vi.fn().mockResolvedValue(context), service: { startNode } as never }).startNode({}))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(startNode).not.toHaveBeenCalled()
    },
  )
})
