import { describe, expect, it, vi } from 'vitest'
import { createHttpWorkflowRepository } from '../../../app/repositories/http/http-workflow-repository'

const companyId = '82000000-0000-4000-8000-000000000020'
const executionId = '82000000-0000-4000-8000-000000000030'

describe('HTTP Workflow repository', () => {
  it('reads the exact WorkflowRuntime from the approved Opportunity-scoped endpoint', async () => {
    const runtime = {
      workflowInstanceId: '82000000-0000-4000-8000-000000000050',
      opportunityId: '82000000-0000-4000-8000-000000000051',
      definitionSnapshotId: '82000000-0000-4000-8000-000000000052',
      nodes: ['01.1', '01.2'].map((nodeKey, index) => ({
        nodeInstanceId: `82000000-0000-4000-8000-00000000006${index}`,
        nodeExecutionId: `82000000-0000-4000-8000-00000000007${index}`,
        nodeKey, nodeType: 'sub_stage', executionNo: 1, phase: 'not_started',
        state: index === 0 ? 'ready' : 'locked', needsRevalidation: false,
        startedBy: null, startedAt: null, completedBy: null, completedAt: null,
        version: 0, assignments: [], blockers: [],
      })),
    }
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(runtime))
    const repository = createHttpWorkflowRepository({ companyId, client: { request } as never })
    await expect(repository.getForOpportunity(runtime.opportunityId)).resolves.toEqual(runtime)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/opportunities/${runtime.opportunityId}/workflow`, method: 'GET',
    }))
  })

  it('uses one fixed complete route and parses its node-runtime response', async () => {
    const response = {
      nodeInstanceId: '82000000-0000-4000-8000-000000000031', nodeExecutionId: executionId,
      nodeKey: '01.1', nodeType: 'sub_stage', executionNo: 1, phase: 'active', state: 'active',
      needsRevalidation: false, startedBy: '82000000-0000-4000-8000-000000000001',
      startedAt: '2026-08-30T00:00:00.000Z', completedBy: null, completedAt: null,
      version: 1, assignments: [], blockers: [],
    }
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(response))
    const repository = createHttpWorkflowRepository({ companyId, client: { request } as never })
    const input = { expectedExecutionVersion: 1, expectedOpportunityVersion: 2 }
    await expect(repository.completeNode(executionId, input)).resolves.toMatchObject({ nodeKey: '01.1' })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/workflow-nodes/${executionId}/complete`, method: 'POST', body: input,
    }))
  })

  it('uses explicit assignment and blocker command routes with null acknowledgements', async () => {
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(null))
    const repository = createHttpWorkflowRepository({ companyId, client: { request } as never })
    await repository.endAssignment('82000000-0000-4000-8000-000000000040', { endReason: 'Changed', expectedExecutionVersion: 2 })
    await repository.resolveBlocker('82000000-0000-4000-8000-000000000041', { resolution: 'Resolved', expectedExecutionVersion: 3 })
    expect(request.mock.calls.map(call => call[0].url)).toEqual([
      `/api/companies/${companyId}/workflow-assignments/82000000-0000-4000-8000-000000000040/end`,
      `/api/companies/${companyId}/workflow-blockers/82000000-0000-4000-8000-000000000041/resolve`,
    ])
  })

  it('sends nested revalidation evidence through the fixed HTTP route', async () => {
    const response = {
      nodeInstanceId: '82000000-0000-4000-8000-000000000031', nodeExecutionId: executionId,
      nodeKey: '01.1', nodeType: 'sub_stage', executionNo: 1, phase: 'active', state: 'active',
      needsRevalidation: false, startedBy: '82000000-0000-4000-8000-000000000001',
      startedAt: '2026-08-30T00:00:00.000Z', completedBy: null, completedAt: null,
      version: 4, assignments: [], blockers: [],
    }
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(response))
    const repository = createHttpWorkflowRepository({ companyId, client: { request } as never })
    const input = {
      reason: 'Prerequisites corrected',
      evidence: [{ kind: 'baseline_ref', ref: 'baseline:2' }],
      expectedExecutionVersion: 3,
    }
    await expect(repository.revalidateNode(executionId, input)).resolves.toMatchObject({ version: 4 })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: `/api/companies/${companyId}/workflow-nodes/${executionId}/revalidate`,
      method: 'POST',
      body: input,
    }))
  })
})
