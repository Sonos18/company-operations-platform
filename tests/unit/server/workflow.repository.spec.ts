import { describe, expect, it, vi } from 'vitest'
import { createSupabaseWorkflowRepository } from '../../../server/features/workflow/workflow.repository'

describe('Stage 01 Workflow repository', () => {
  it('uses the fixed assignment RPC and forwards only scoped command arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        assignmentId: '62000000-0000-4000-8000-000000000030',
        nodeExecutionId: '62000000-0000-4000-8000-000000000031',
        executionVersion: 1,
      },
      error: null,
    })
    const repository = createSupabaseWorkflowRepository({ rpc } as never)
    const input = {
      assignmentKind: 'accountable_owner' as const,
      assigneeUserId: '62000000-0000-4000-8000-000000000001',
      expectedExecutionVersion: 0,
    }
    await repository.assign(
      '62000000-0000-4000-8000-000000000020',
      '62000000-0000-4000-8000-000000000031', input,
      '62000000-0000-4000-8000-000000000099',
    )
    expect(rpc).toHaveBeenCalledWith('assign_workflow_node', {
      target_company_id: '62000000-0000-4000-8000-000000000020',
      target_execution_id: '62000000-0000-4000-8000-000000000031',
      target_input: input,
      target_request_id: '62000000-0000-4000-8000-000000000099',
    })
  })

  it('maps a foreign assignee database validation error to safe employee-not-found instead of 500', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'COMPANY_MEMBER_NOT_FOUND' },
    })
    const repository = createSupabaseWorkflowRepository({ rpc } as never)

    await expect(repository.assign(
      '62000000-0000-4000-8000-000000000020',
      '62000000-0000-4000-8000-000000000031',
      { assignmentKind: 'accountable_owner', assigneeUserId: '62000000-0000-4000-8000-000000000001', expectedExecutionVersion: 0 },
      '62000000-0000-4000-8000-000000000099',
    )).rejects.toMatchObject({
      statusCode: 404,
      code: 'EMPLOYEE_NOT_FOUND',
      message: 'Không tìm thấy nhân viên hợp lệ trong công ty này.',
    })
  })

  it('forwards revalidation evidence to the fixed RPC before refreshing runtime', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        opportunityId: '62000000-0000-4000-8000-000000000032',
        nodeExecutionId: '62000000-0000-4000-8000-000000000031',
        executionVersion: 4,
      },
      error: null,
    })
    const repository = createSupabaseWorkflowRepository({
      rpc,
      from: vi.fn(() => { throw new Error('controlled runtime refresh stop') }),
    } as never)
    const input = {
      reason: 'Prerequisites corrected',
      evidence: [{ kind: 'baseline_ref', ref: 'baseline:2' }],
      expectedExecutionVersion: 3,
    }
    await expect(repository.revalidateNode(
      '62000000-0000-4000-8000-000000000020',
      '62000000-0000-4000-8000-000000000031',
      input,
      '62000000-0000-4000-8000-000000000099',
    )).rejects.toThrow('controlled runtime refresh stop')
    expect(rpc).toHaveBeenCalledWith('revalidate_workflow_node', {
      target_company_id: '62000000-0000-4000-8000-000000000020',
      target_execution_id: '62000000-0000-4000-8000-000000000031',
      target_input: input,
      target_request_id: '62000000-0000-4000-8000-000000000099',
    })
  })
})
