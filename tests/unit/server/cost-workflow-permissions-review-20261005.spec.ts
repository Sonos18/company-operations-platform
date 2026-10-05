import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { authenticateBearer } from '../../../server/utils/auth-context'
import { createCostWorkflowRoutes } from '../../../server/features/costs/workflow/cost-workflow.routes'
import { SupabaseWorkflowEvidenceRepository } from '../../../server/features/costs/workflow/cost-workflow-evidence.repository'
import { SupabaseWorkflowRepository } from '../../../server/features/costs/workflow/cost-workflow.repository'

vi.mock('h3', () => ({
  getRouterParam: (e: H3Event, name: string) => e.context.params?.[name],
  getHeader: (e: H3Event, name: string) => e.context.headers?.[name],
  getQuery: () => ({}),
  readBody: async (e: H3Event) => e.context.body,
}))
const actor = 'c1f50000-0000-4000-8000-000000000001'
const company = 'c1f50000-0000-4000-8000-000000000002'
const project = 'c1f50000-0000-4000-8000-000000000003'
const file = 'c1f50000-0000-4000-8000-000000000004'
const other = 'c1f50000-0000-4000-8000-000000000005'
const c = { actorId: actor, tenantId: company, companyId: company, requestId: file, permissions: ['cost.notification.read'] as const, db: {} }

describe('owned permissions review: fresh application and repository boundaries', () => {
  it('verifies the same bearer again and fails after the verifier revokes it', async () => {
    const getUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: { id: actor } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error('revoked') })
    expect((await authenticateBearer('Bearer synthetic-token', { getUser })).userId).toBe(actor)
    await expect(authenticateBearer('Bearer synthetic-token', { getUser }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_INVALID' })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('resolves fresh server context on notification refresh and does not reuse old authority', async () => {
    const denied = Object.assign(new Error('membership revoked'), { statusCode: 403 })
    const resolveContext = vi.fn().mockResolvedValueOnce(c).mockRejectedValueOnce(denied)
    const listNotifications = vi.fn().mockResolvedValue([])
    const routes = createCostWorkflowRoutes({ resolveContext, service: { listNotifications } as never })
    const e = { context: { params: { companyId: company }, actorId: other, permissions: ['company.admin'] } } as unknown as H3Event
    await routes.listNotifications(e)
    await expect(routes.listNotifications(e)).rejects.toBe(denied)
    expect(resolveContext).toHaveBeenCalledTimes(2)
    expect(resolveContext).toHaveBeenNthCalledWith(2, e, company)
    expect(listNotifications).toHaveBeenCalledExactlyOnceWith(c)
  })

  it.each(['inline', 'attachment'] as const)('rechecks file authority on every %s URL, including after handover', async disposition => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { bucketId: 'c1-accounting-evidence', objectPath: 'synthetic/scoped-file' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'PERMISSION_DENIED' } })
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.invalid/synthetic' }, error: null })
    const r = new SupabaseWorkflowEvidenceRepository({ rpc, storage: { from: () => ({ createSignedUrl: sign }) } } as never)
    await r.createReadUrl(c, project, file, { disposition })
    await expect(r.createReadUrl(c, project, file, { disposition })).rejects.toMatchObject({ statusCode: 403 })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(sign).toHaveBeenCalledExactlyOnceWith('synthetic/scoped-file', 60, { download: disposition === 'attachment' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'c1_workflow_evidence_read_target', { target_company_id: company, target_project_id: project, target_id: file })
  })

  it.each([
    { companyId: other, projectId: project },
    { companyId: company, projectId: other },
  ])('preserves foreign route scope and never signs a denied target: %j', async scope => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'RESOURCE_NOT_FOUND' } })
    const sign = vi.fn()
    const r = new SupabaseWorkflowEvidenceRepository({ rpc, storage: { from: () => ({ createSignedUrl: sign }) } } as never)
    await expect(r.createReadUrl({ ...c, companyId: scope.companyId }, scope.projectId, file, { disposition: 'attachment' }))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('c1_workflow_evidence_read_target', {
      target_company_id: scope.companyId, target_project_id: scope.projectId, target_id: file,
    })
    expect(sign).not.toHaveBeenCalled()
  })

  it('notification list/read send captured company and correlation only; recipient/actor are derived by SQL', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: { notificationId: file, version: 0, replayed: false }, error: null })
    const r = new SupabaseWorkflowRepository({ rpc } as never)
    await r.listNotifications({ ...c, companyId: other })
    await r.markNotificationRead(c, file, other)
    expect(rpc.mock.calls).toEqual([
      ['c1_workflow_list_notifications', { target_company_id: other }],
      ['c1_workflow_read_notification', { target_company_id: company, target_id: file, target_input: {}, target_idempotency_key: other, target_request_id: file }],
    ])
  })
})
