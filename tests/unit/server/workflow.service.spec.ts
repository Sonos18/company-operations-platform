import { describe, expect, it, vi } from 'vitest'
import { createWorkflowService } from '../../../server/features/workflow/workflow.service'

const context = {
  actorId: '65000000-0000-4000-8000-000000000001',
  tenantId: '65000000-0000-4000-8000-000000000010',
  companyId: '65000000-0000-4000-8000-000000000020',
  permissions: ['journey.node.complete'] as const,
  requestId: '65000000-0000-4000-8000-000000000099',
}

describe('Stage 01 Workflow service', () => {
  it.each([
    ['01.1', 'completeIntake'],
    ['01.2', 'completeEvaluation'],
  ] as const)('dispatches bound node %s to %s', async (nodeKey, method) => {
    const repository = {
      getNodeIdentity: vi.fn().mockResolvedValue(nodeKey),
      completeIntake: vi.fn().mockResolvedValue({ nodeKey }),
      completeEvaluation: vi.fn().mockResolvedValue({ nodeKey }),
    }
    const input = {
      expectedExecutionVersion: 1,
      ...(nodeKey === '01.1' ? { expectedOpportunityVersion: 2 } : { expectedCycleVersion: 3 }),
    }
    await createWorkflowService(repository as never).completeNode(
      context, '65000000-0000-4000-8000-000000000030', input,
    )
    expect(repository[method]).toHaveBeenCalledWith(
      context.companyId, '65000000-0000-4000-8000-000000000030', input, context.requestId,
    )
  })
})
