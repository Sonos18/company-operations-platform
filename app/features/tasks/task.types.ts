export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done'

export interface ProjectTask {
  tenantId: string
  companyId: string
  id: string
  projectId: string
  projectName: string
  stageId: string
  stageName: string
  title: string
  ownerName: string
  status: TaskStatus
  priority: 'high' | 'medium' | 'low'
  dueAt: string | null
  assignmentSource: 'director' | 'self_proposed'
  relatedRecordLabel: string | null
}
