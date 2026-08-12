import type { ProjectStage, WorkflowSnapshot } from '../journey/journey.types'

export interface ProjectSummary {
  tenantId: string
  companyId: string
  id: string
  code: string
  name: string
  clientName: string
  location: string
  coverUrl: string
  currentStageId: string
  currentStageName: string
  completedStageCount: number
  totalStageCount: number
  ownerDepartments: string[]
  lastActivityAt: string
}

export interface ProjectDetail extends ProjectSummary {
  workflowSnapshot: WorkflowSnapshot
  stages: ProjectStage[]
}
