import type {
  WorkflowInternalPhase,
  WorkflowNodeState,
} from '../../../shared/schemas/workflow'

export interface WorkflowStateInput {
  phase: WorkflowInternalPhase
  dependenciesSatisfied: boolean
  hasOpenBlockingBlocker: boolean
}

export function deriveWorkflowNodeState(input: WorkflowStateInput): WorkflowNodeState {
  if (input.phase === 'completed' || input.phase === 'not_applicable') return input.phase
  if (input.phase === 'active') return input.hasOpenBlockingBlocker ? 'blocked' : 'active'
  return input.dependenciesSatisfied ? 'ready' : 'locked'
}
