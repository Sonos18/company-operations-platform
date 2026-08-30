import { z } from 'zod'
import {
  assignWorkflowNodeInputSchema,
  completeWorkflowNodeInputSchema,
  endWorkflowAssignmentInputSchema,
  raiseWorkflowBlockerInputSchema,
  reopenWorkflowNodeInputSchema,
  resolveWorkflowBlockerInputSchema,
  revalidateWorkflowNodeInputSchema,
  startWorkflowNodeInputSchema,
  workflowNodeRuntimeSchema,
  workflowRuntimeSchema,
} from '../../../shared/schemas/workflow'
import type { WorkflowRepository } from '../contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export interface HttpWorkflowRepositoryOptions {
  companyId: string
  client: AuthenticatedHttpClient
}

export function createHttpWorkflowRepository(options: HttpWorkflowRepositoryOptions): WorkflowRepository {
  const base = `/api/companies/${encodeURIComponent(options.companyId)}`
  const id = (value: string) => encodeURIComponent(value)
  const post = <T>(url: string, input: unknown, schema: z.ZodType<T>) => options.client.request({
    url, method: 'POST', body: input, schema,
  })
  const postVoid = async (url: string, input: unknown) => {
    await post(url, input, z.null())
  }
  const nodeCommand = <T>(nodeExecutionId: string, action: string, input: unknown, schema: z.ZodType<T>) => (
    post(`${base}/workflow-nodes/${id(nodeExecutionId)}/${action}`, input, schema)
  )

  return {
    getForOpportunity: opportunityId => options.client.request({
      url: `${base}/opportunities/${id(opportunityId)}/workflow`, method: 'GET',
      schema: workflowRuntimeSchema,
    }),
    startNode: (executionId, input) => nodeCommand(executionId, 'start', startWorkflowNodeInputSchema.parse(input), workflowNodeRuntimeSchema),
    completeNode: (executionId, input) => nodeCommand(executionId, 'complete', completeWorkflowNodeInputSchema.parse(input), workflowNodeRuntimeSchema),
    reopenNode: (executionId, input) => nodeCommand(executionId, 'reopen', reopenWorkflowNodeInputSchema.parse(input), workflowNodeRuntimeSchema),
    revalidateNode: (executionId, input) => nodeCommand(executionId, 'revalidate', revalidateWorkflowNodeInputSchema.parse(input), workflowNodeRuntimeSchema),
    assign: (executionId, input) => postVoid(`${base}/workflow-nodes/${id(executionId)}/assignments`, assignWorkflowNodeInputSchema.parse(input)),
    endAssignment: (assignmentId, input) => postVoid(`${base}/workflow-assignments/${id(assignmentId)}/end`, endWorkflowAssignmentInputSchema.parse(input)),
    raiseBlocker: (executionId, input) => postVoid(`${base}/workflow-nodes/${id(executionId)}/blockers`, raiseWorkflowBlockerInputSchema.parse(input)),
    resolveBlocker: (blockerId, input) => postVoid(`${base}/workflow-blockers/${id(blockerId)}/resolve`, resolveWorkflowBlockerInputSchema.parse(input)),
  }
}
