import { z } from 'zod'

const uuidSchema = z.string().uuid()
const versionSchema = z.number().int().nonnegative()
const meaningfulTextSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })

export const workflowNodeStateSchema = z.enum([
  'locked',
  'ready',
  'active',
  'blocked',
  'completed',
  'not_applicable',
])
export type WorkflowNodeState = z.infer<typeof workflowNodeStateSchema>

export const workflowInternalPhaseSchema = z.enum([
  'not_started',
  'active',
  'completed',
  'not_applicable',
])
export type WorkflowInternalPhase = z.infer<typeof workflowInternalPhaseSchema>

export const gateCheckStatusSchema = z.enum([
  'satisfied',
  'missing',
  'blocked',
  'needs_revalidation',
])

export const gateCheckSchema = z.object({
  code: meaningfulTextSchema,
  status: gateCheckStatusSchema,
  message: meaningfulTextSchema,
  resourceRef: meaningfulTextSchema.optional(),
}).strict()

export const gateReportSchema = z.object({
  satisfied: z.boolean(),
  checks: z.array(gateCheckSchema),
}).strict()
export type GateReport = z.infer<typeof gateReportSchema>

export const workflowAssignmentKindSchema = z.enum(['accountable_owner', 'contributor'])
export const workflowBlockerEffectSchema = z.enum(['blocking', 'non_blocking'])

export const workflowNodeAssignmentSchema = z.object({
  id: uuidSchema,
  nodeExecutionId: uuidSchema,
  assignmentKind: workflowAssignmentKindSchema,
  assigneeUserId: uuidSchema,
  assignedBy: uuidSchema,
  assignedAt: timestampSchema,
  assignmentReason: meaningfulTextSchema.nullable(),
  endedBy: uuidSchema.nullable(),
  endedAt: timestampSchema.nullable(),
  endReason: meaningfulTextSchema.nullable(),
}).strict()
export type WorkflowNodeAssignment = z.infer<typeof workflowNodeAssignmentSchema>

export const workflowBlockerSchema = z.object({
  id: uuidSchema,
  nodeExecutionId: uuidSchema,
  effect: workflowBlockerEffectSchema,
  categoryCode: meaningfulTextSchema,
  description: meaningfulTextSchema,
  raisedBy: uuidSchema,
  raisedAt: timestampSchema,
  responsibleUserId: uuidSchema.nullable(),
  resolvedBy: uuidSchema.nullable(),
  resolvedAt: timestampSchema.nullable(),
  resolution: meaningfulTextSchema.nullable(),
  version: versionSchema,
}).strict()
export type WorkflowBlocker = z.infer<typeof workflowBlockerSchema>

export const workflowNodeRuntimeSchema = z.object({
  nodeInstanceId: uuidSchema,
  nodeExecutionId: uuidSchema,
  nodeKey: z.enum(['01.1', '01.2']),
  nodeType: meaningfulTextSchema,
  executionNo: z.number().int().positive(),
  phase: workflowInternalPhaseSchema,
  state: workflowNodeStateSchema,
  needsRevalidation: z.boolean(),
  startedBy: uuidSchema.nullable(),
  startedAt: timestampSchema.nullable(),
  completedBy: uuidSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  version: versionSchema,
  assignments: z.array(workflowNodeAssignmentSchema),
  blockers: z.array(workflowBlockerSchema),
}).strict()
export type WorkflowNodeRuntime = z.infer<typeof workflowNodeRuntimeSchema>

export const workflowRuntimeSchema = z.object({
  workflowInstanceId: uuidSchema,
  opportunityId: uuidSchema,
  definitionSnapshotId: uuidSchema,
  nodes: z.array(workflowNodeRuntimeSchema).length(2),
}).strict()
export type WorkflowRuntime = z.infer<typeof workflowRuntimeSchema>

export const expectedOpportunityVersionSchema = z.object({
  expectedOpportunityVersion: versionSchema,
}).strict()
export type ExpectedOpportunityVersion = z.infer<typeof expectedOpportunityVersionSchema>

export const expectedContactVersionSchema = z.object({
  expectedContactVersion: versionSchema,
}).strict()
export type ExpectedContactVersion = z.infer<typeof expectedContactVersionSchema>

export const expectedExecutionVersionSchema = z.object({
  expectedExecutionVersion: versionSchema,
}).strict()
export type ExpectedExecutionVersion = z.infer<typeof expectedExecutionVersionSchema>

export const expectedCycleVersionSchema = z.object({
  expectedCycleVersion: versionSchema,
}).strict()
export type ExpectedCycleVersion = z.infer<typeof expectedCycleVersionSchema>

export const assignWorkflowNodeInputSchema = z.object({
  assignmentKind: workflowAssignmentKindSchema,
  assigneeUserId: uuidSchema,
  assignmentReason: meaningfulTextSchema.optional(),
  expectedExecutionVersion: versionSchema,
}).strict()
export type AssignWorkflowNodeInput = z.infer<typeof assignWorkflowNodeInputSchema>

export const endWorkflowAssignmentInputSchema = z.object({
  endReason: meaningfulTextSchema,
  expectedExecutionVersion: versionSchema,
}).strict()
export type EndWorkflowAssignmentInput = z.infer<typeof endWorkflowAssignmentInputSchema>

export const raiseWorkflowBlockerInputSchema = z.object({
  effect: workflowBlockerEffectSchema,
  categoryCode: meaningfulTextSchema,
  description: meaningfulTextSchema,
  responsibleUserId: uuidSchema.nullable().optional(),
  expectedExecutionVersion: versionSchema,
}).strict()
export type RaiseWorkflowBlockerInput = z.infer<typeof raiseWorkflowBlockerInputSchema>

export const resolveWorkflowBlockerInputSchema = z.object({
  resolution: meaningfulTextSchema,
  expectedExecutionVersion: versionSchema,
}).strict()
export type ResolveWorkflowBlockerInput = z.infer<typeof resolveWorkflowBlockerInputSchema>

export const startWorkflowNodeInputSchema = expectedExecutionVersionSchema
export type StartWorkflowNodeInput = z.infer<typeof startWorkflowNodeInputSchema>

export const completeWorkflowNodeInputSchema = z.object({
  expectedExecutionVersion: versionSchema,
  expectedOpportunityVersion: versionSchema.optional(),
  expectedCycleVersion: versionSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.expectedOpportunityVersion === undefined) === (value.expectedCycleVersion === undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'Exactly one owning aggregate version is required',
    })
  }
})
export type CompleteWorkflowNodeInput = z.infer<typeof completeWorkflowNodeInputSchema>

export const reopenWorkflowNodeInputSchema = z.object({
  reason: meaningfulTextSchema,
  expectedExecutionVersion: versionSchema,
}).strict()
export type ReopenWorkflowNodeInput = z.infer<typeof reopenWorkflowNodeInputSchema>

export const revalidateWorkflowNodeInputSchema = z.object({
  reason: meaningfulTextSchema,
  expectedExecutionVersion: versionSchema,
}).strict()
export type RevalidateWorkflowNodeInput = z.infer<typeof revalidateWorkflowNodeInputSchema>
