import { describe, expect, it, vi } from 'vitest'
import { createHttpCostWorkflowRepository } from '../../../app/repositories/http/http-cost-workflow-repository'

const companyId = 'c1f50000-0000-4000-8000-000000000001'
const projectId = 'c1f50000-0000-4000-8000-000000000002'
const requestId = 'c1f50000-0000-4000-8000-000000000003'
const submittedVersionId = 'c1f50000-0000-4000-8000-000000000004'
const notification = {
  id: companyId, projectId, requestId, submittedVersionId,
  decisionId: companyId, recipientId: companyId, kind: 'installment',
  deliveryState: 'available', readAt: null, createdAt: '2026-10-05T00:00:00.000Z',
}
function repository(payload: unknown) {
  const client = { request: vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(payload)) }
  return { client, repo: createHttpCostWorkflowRepository({ companyId, client: client as never }) }
}
describe('approval notification immutable target contract', () => {
  it.each(['installment', 'contract_adjustment', 'refund', 'correction'])('retains scoped identities for %s decisions', async kind => {
    const row = { ...notification, kind }
    const { client, repo } = repository([row])
    expect(await repo.listNotifications()).toEqual([row])
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET', url: '/api/companies/' + companyId + '/cost-notifications',
    }))
  })
  it.each(['requestId', 'submittedVersionId', 'kind'])('rejects a notification missing %s instead of linking to a default record', async field => {
    const row = Object.fromEntries(Object.entries(notification).filter(([key]) => key !== field))
    await expect(repository([row]).repo.listNotifications()).rejects.toThrow()
  })
  it.each([
    { requestId: '../another-project' },
    { submittedVersionId: null },
    { kind: 'payment' },
    { url: 'https://example.invalid/pre-signed-evidence' },
  ])('rejects an invalid or unexpected deep-link payload %j', async patch => {
    await expect(repository([{ ...notification, ...patch }]).repo.listNotifications()).rejects.toThrow()
  })
})
