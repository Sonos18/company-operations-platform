import { z } from 'zod'
import {
  workflowBlockerSchema,
  workflowNodeAssignmentSchema,
  workflowNodeRuntimeSchema,
  workflowRuntimeSchema,
} from '../../../shared/schemas/workflow'
import type {
  AssignWorkflowNodeInput,
  CompleteWorkflowNodeInput,
  EndWorkflowAssignmentInput,
  RaiseWorkflowBlockerInput,
  ReopenWorkflowNodeInput,
  ResolveWorkflowBlockerInput,
  RevalidateWorkflowNodeInput,
  StartWorkflowNodeInput,
  WorkflowBlocker,
  WorkflowNodeAssignment,
  WorkflowNodeRuntime,
  WorkflowRuntime,
} from '../../../shared/schemas/workflow'
import type { UserSupabaseClient } from '../../utils/supabase-client'
import { failStage01Database, mapStage01RpcError } from '../stage01/stage01-errors'
import { deriveWorkflowNodeState } from './workflow-state'

export interface WorkflowDataRepository {
  getForOpportunity(companyId: string, opportunityId: string): Promise<WorkflowRuntime | null>
  getNodeIdentity(companyId: string, executionId: string): Promise<'01.1' | '01.2' | null>
  startNode(companyId: string, executionId: string, input: StartWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  completeIntake(companyId: string, executionId: string, input: CompleteWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  completeEvaluation(companyId: string, executionId: string, input: CompleteWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  reopenNode(companyId: string, executionId: string, input: ReopenWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  revalidateNode(companyId: string, executionId: string, input: RevalidateWorkflowNodeInput, requestId: string): Promise<WorkflowNodeRuntime>
  assign(companyId: string, executionId: string, input: AssignWorkflowNodeInput, requestId: string): Promise<void>
  endAssignment(companyId: string, assignmentId: string, input: EndWorkflowAssignmentInput, requestId: string): Promise<void>
  raiseBlocker(companyId: string, executionId: string, input: RaiseWorkflowBlockerInput, requestId: string): Promise<void>
  resolveBlocker(companyId: string, blockerId: string, input: ResolveWorkflowBlockerInput, requestId: string): Promise<void>
}

interface QueryResult { data: unknown, error: unknown }
interface Query extends PromiseLike<QueryResult> {
  select(columns: string): Query
  eq(column: string, value: string): Query
  is(column: string, value: null): Query
  in(column: string, values: string[]): Query
  order(column: string, options?: { ascending?: boolean }): Query
  maybeSingle(): Promise<QueryResult>
}
interface WorkflowDataClient {
  from(table: string): Query
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>
}

const uuid = z.string().uuid()
const version = z.number().int().nonnegative()
const timestamp = z.string().datetime({ offset: true })
const workflowInstanceRowSchema = z.object({ id: uuid, subject_id: uuid, definition_snapshot_id: uuid }).strict()
const nodeRowSchema = z.object({ id: uuid, workflow_instance_id: uuid, node_key: z.enum(['01.1', '01.2']), node_type: z.string().trim().min(1) }).strict()
const executionRowSchema = z.object({
  id: uuid, node_instance_id: uuid, execution_no: z.number().int().positive(),
  phase: z.enum(['not_started', 'active', 'completed', 'not_applicable']), needs_revalidation: z.boolean(),
  started_by: uuid.nullable(), started_at: timestamp.nullable(), completed_by: uuid.nullable(), completed_at: timestamp.nullable(), version,
}).strict()
const assignmentRowSchema = z.object({
  id: uuid, node_execution_id: uuid, assignment_kind: z.enum(['accountable_owner', 'contributor']), assignee_user_id: uuid,
  assigned_by: uuid, assigned_at: timestamp, assignment_reason: z.string().trim().min(1).nullable(),
  ended_by: uuid.nullable(), ended_at: timestamp.nullable(), end_reason: z.string().trim().min(1).nullable(),
}).strict()
const blockerRowSchema = z.object({
  id: uuid, node_execution_id: uuid, effect: z.enum(['blocking', 'non_blocking']), category_code: z.string().trim().min(1),
  description: z.string().trim().min(1), raised_by: uuid, raised_at: timestamp, responsible_user_id: uuid.nullable(),
  resolved_by: uuid.nullable(), resolved_at: timestamp.nullable(), resolution: z.string().trim().min(1).nullable(), version,
}).strict()

const workflowInstanceColumns = 'id, subject_id, definition_snapshot_id'
const nodeColumns = 'id, workflow_instance_id, node_key, node_type'
const executionColumns = 'id, node_instance_id, execution_no, phase, needs_revalidation, started_by, started_at, completed_by, completed_at, version'
const assignmentColumns = 'id, node_execution_id, assignment_kind, assignee_user_id, assigned_by, assigned_at, assignment_reason, ended_by, ended_at, end_reason'
const blockerColumns = 'id, node_execution_id, effect, category_code, description, raised_by, raised_at, responsible_user_id, resolved_by, resolved_at, resolution, version'

const executionCommandResultSchema = z.object({ opportunityId: uuid, nodeExecutionId: uuid, executionVersion: version }).strict()
const intakeCompletionResultSchema = z.object({
  opportunityId: uuid, nodeExecutionId: uuid, executionVersion: version,
  baselineId: uuid, baselineVersion: z.number().int().positive(), completionEventId: z.number().int().positive(),
}).strict()
const evaluationCompletionResultSchema = z.object({
  opportunityId: uuid, nodeExecutionId: uuid, decisionCycleId: uuid,
  executionVersion: version, cycleVersion: version,
}).strict()
const assignmentCommandResultSchema = z.object({ assignmentId: uuid, nodeExecutionId: uuid, executionVersion: version }).strict()
const blockerCommandResultSchema = z.object({ blockerId: uuid, nodeExecutionId: uuid, executionVersion: version }).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) return failStage01Database(message)
  return result.data
}
function mapAssignment(row: z.infer<typeof assignmentRowSchema>): WorkflowNodeAssignment {
  return workflowNodeAssignmentSchema.parse({ id: row.id, nodeExecutionId: row.node_execution_id,
    assignmentKind: row.assignment_kind, assigneeUserId: row.assignee_user_id, assignedBy: row.assigned_by,
    assignedAt: row.assigned_at, assignmentReason: row.assignment_reason, endedBy: row.ended_by,
    endedAt: row.ended_at, endReason: row.end_reason })
}
function mapBlocker(row: z.infer<typeof blockerRowSchema>): WorkflowBlocker {
  return workflowBlockerSchema.parse({ id: row.id, nodeExecutionId: row.node_execution_id, effect: row.effect,
    categoryCode: row.category_code, description: row.description, raisedBy: row.raised_by, raisedAt: row.raised_at,
    responsibleUserId: row.responsible_user_id, resolvedBy: row.resolved_by, resolvedAt: row.resolved_at,
    resolution: row.resolution, version: row.version })
}

export function createSupabaseWorkflowRepository(db: UserSupabaseClient): WorkflowDataRepository {
  const client = db as unknown as WorkflowDataClient

  async function rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, message: string): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) return mapStage01RpcError(error, message)
    return parse(schema, data, message)
  }

  async function getForOpportunity(companyId: string, opportunityId: string): Promise<WorkflowRuntime | null> {
    const workflowResult = await client.from('workflow_instances').select(workflowInstanceColumns)
      .eq('company_id', companyId).eq('subject_type', 'opportunity').eq('subject_id', opportunityId).maybeSingle()
    if (workflowResult.error) return failStage01Database('Không thể đọc Workflow runtime.')
    if (workflowResult.data === null) return null
    const workflow = parse(workflowInstanceRowSchema, workflowResult.data, 'Không thể đọc Workflow runtime.')

    const nodeResult = await client.from('workflow_node_instances').select(nodeColumns)
      .eq('company_id', companyId).eq('workflow_instance_id', workflow.id).order('node_key')
    if (nodeResult.error) return failStage01Database('Không thể đọc Workflow nodes.')
    const nodes = parse(z.array(nodeRowSchema).length(2), nodeResult.data, 'Không thể đọc Workflow nodes.')
    const executionResult = await client.from('workflow_node_executions').select(executionColumns)
      .eq('company_id', companyId).in('node_instance_id', nodes.map(node => node.id)).is('superseded_at', null)
    if (executionResult.error) return failStage01Database('Không thể đọc Workflow executions.')
    const executions = parse(z.array(executionRowSchema).length(2), executionResult.data, 'Không thể đọc Workflow executions.')
    const executionIds = executions.map(execution => execution.id)
    const [assignmentResult, blockerResult] = await Promise.all([
      client.from('workflow_node_assignments').select(assignmentColumns).eq('company_id', companyId).in('node_execution_id', executionIds).order('assigned_at'),
      client.from('workflow_blockers').select(blockerColumns).eq('company_id', companyId).in('node_execution_id', executionIds).order('raised_at'),
    ])
    if (assignmentResult.error || blockerResult.error) return failStage01Database('Không thể đọc Workflow resources.')
    const assignments = parse(z.array(assignmentRowSchema), assignmentResult.data, 'Không thể đọc Workflow assignments.')
    const blockers = parse(z.array(blockerRowSchema), blockerResult.data, 'Không thể đọc Workflow blockers.')
    const intakeExecution = executions.find(execution => nodes.find(node => node.id === execution.node_instance_id)?.node_key === '01.1')
    if (!intakeExecution) return failStage01Database('Không thể xác định Intake execution.')

    const runtimeNodes = nodes.map((node): WorkflowNodeRuntime => {
      const execution = executions.find(candidate => candidate.node_instance_id === node.id)
      if (!execution) return failStage01Database('Không thể xác định Workflow execution.')
      const nodeAssignments = assignments.filter(value => value.node_execution_id === execution.id).map(mapAssignment)
      const nodeBlockers = blockers.filter(value => value.node_execution_id === execution.id).map(mapBlocker)
      const dependenciesSatisfied = node.node_key === '01.1'
        || (intakeExecution.phase === 'completed' && !intakeExecution.needs_revalidation)
      return workflowNodeRuntimeSchema.parse({
        nodeInstanceId: node.id, nodeExecutionId: execution.id, nodeKey: node.node_key, nodeType: node.node_type,
        executionNo: execution.execution_no, phase: execution.phase,
        state: deriveWorkflowNodeState({ phase: execution.phase, dependenciesSatisfied,
          hasOpenBlockingBlocker: nodeBlockers.some(blocker => blocker.effect === 'blocking' && blocker.resolvedAt === null) }),
        needsRevalidation: execution.needs_revalidation, startedBy: execution.started_by, startedAt: execution.started_at,
        completedBy: execution.completed_by, completedAt: execution.completed_at, version: execution.version,
        assignments: nodeAssignments, blockers: nodeBlockers,
      })
    })
    return workflowRuntimeSchema.parse({ workflowInstanceId: workflow.id, opportunityId: workflow.subject_id,
      definitionSnapshotId: workflow.definition_snapshot_id, nodes: runtimeNodes })
  }

  async function getNodeIdentity(companyId: string, executionId: string): Promise<'01.1' | '01.2' | null> {
    const executionResult = await client.from('workflow_node_executions').select('node_instance_id')
      .eq('company_id', companyId).eq('id', executionId).maybeSingle()
    if (executionResult.error) return failStage01Database('Không thể đọc Workflow execution.')
    if (executionResult.data === null) return null
    const execution = parse(z.object({ node_instance_id: uuid }).strict(), executionResult.data, 'Không thể đọc Workflow execution.')
    const nodeResult = await client.from('workflow_node_instances').select('node_key')
      .eq('company_id', companyId).eq('id', execution.node_instance_id).maybeSingle()
    if (nodeResult.error) return failStage01Database('Không thể đọc Workflow node.')
    if (nodeResult.data === null) return null
    return parse(z.object({ node_key: z.enum(['01.1', '01.2']) }).strict(), nodeResult.data, 'Không thể đọc Workflow node.').node_key
  }

  async function runtimeForExecution(companyId: string, executionId: string): Promise<WorkflowNodeRuntime> {
    const executionResult = await client.from('workflow_node_executions').select('node_instance_id')
      .eq('company_id', companyId).eq('id', executionId).maybeSingle()
    if (executionResult.error || executionResult.data === null) return failStage01Database('Không thể đọc Workflow execution.')
    const execution = parse(z.object({ node_instance_id: uuid }).strict(), executionResult.data, 'Không thể đọc Workflow execution.')
    const nodeResult = await client.from('workflow_node_instances').select('workflow_instance_id')
      .eq('company_id', companyId).eq('id', execution.node_instance_id).maybeSingle()
    if (nodeResult.error || nodeResult.data === null) return failStage01Database('Không thể đọc Workflow node.')
    const node = parse(z.object({ workflow_instance_id: uuid }).strict(), nodeResult.data, 'Không thể đọc Workflow node.')
    const workflowResult = await client.from('workflow_instances').select('subject_id')
      .eq('company_id', companyId).eq('id', node.workflow_instance_id).maybeSingle()
    if (workflowResult.error || workflowResult.data === null) return failStage01Database('Không thể đọc Workflow instance.')
    const workflow = parse(z.object({ subject_id: uuid }).strict(), workflowResult.data, 'Không thể đọc Workflow instance.')
    const runtime = await getForOpportunity(companyId, workflow.subject_id)
    const result = runtime?.nodes.find(candidate => candidate.nodeExecutionId === executionId)
    return result ?? failStage01Database('Không thể đọc Workflow node runtime.')
  }

  return {
    getForOpportunity,
    getNodeIdentity,
    async startNode(companyId, executionId, input, requestId) {
      await rpc('start_workflow_node', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, executionCommandResultSchema, 'Không thể start Workflow node.')
      return runtimeForExecution(companyId, executionId)
    },
    async completeIntake(companyId, executionId, input, requestId) {
      await rpc('complete_stage01_intake', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, intakeCompletionResultSchema, 'Không thể complete Intake.')
      return runtimeForExecution(companyId, executionId)
    },
    async completeEvaluation(companyId, executionId, input, requestId) {
      await rpc('complete_stage01_evaluation', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, evaluationCompletionResultSchema, 'Không thể complete Evaluation.')
      return runtimeForExecution(companyId, executionId)
    },
    async reopenNode(companyId, executionId, input, requestId) {
      await rpc('reopen_workflow_node', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, executionCommandResultSchema, 'Không thể reopen Workflow node.')
      return runtimeForExecution(companyId, executionId)
    },
    async revalidateNode(companyId, executionId, input, requestId) {
      await rpc('revalidate_workflow_node', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, executionCommandResultSchema, 'Không thể revalidate Workflow node.')
      return runtimeForExecution(companyId, executionId)
    },
    async assign(companyId, executionId, input, requestId) {
      await rpc('assign_workflow_node', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, assignmentCommandResultSchema, 'Không thể assign Workflow node.')
    },
    async endAssignment(companyId, assignmentId, input, requestId) {
      await rpc('end_workflow_assignment', { target_company_id: companyId, target_assignment_id: assignmentId, target_input: input, target_request_id: requestId }, assignmentCommandResultSchema, 'Không thể kết thúc Workflow assignment.')
    },
    async raiseBlocker(companyId, executionId, input, requestId) {
      await rpc('raise_workflow_blocker', { target_company_id: companyId, target_execution_id: executionId, target_input: input, target_request_id: requestId }, blockerCommandResultSchema, 'Không thể tạo Workflow blocker.')
    },
    async resolveBlocker(companyId, blockerId, input, requestId) {
      await rpc('resolve_workflow_blocker', { target_company_id: companyId, target_blocker_id: blockerId, target_input: input, target_request_id: requestId }, blockerCommandResultSchema, 'Không thể resolve Workflow blocker.')
    },
  }
}
