export type EnforcementMode = 'advisory'
export type StageStatus = 'completed' | 'active' | 'upcoming' | 'incomplete' | 'not_applicable'

export interface StageStep {
  id: string
  code: string
  name: string
  status: StageStatus
  ownerName: string
}

export interface StageRecord {
  id: string
  label: string
  kind: 'form' | 'contract' | 'document' | 'evidence'
  status: 'ready' | 'missing' | 'draft'
}

export interface StageActivity {
  id: string
  at: string
  actorName: string
  description: string
}

export interface ProjectStage {
  tenantId: string
  companyId: string
  id: string
  code: string
  name: string
  purpose: string
  status: StageStatus
  completedCount: number
  totalCount: number
  ownerDepartment: string
  dueAt: string | null
  lastActivityAt: string
  requiredRecordCount: number
  missingRecordCount: number
  visualKind: 'record' | 'drawing' | 'construction_comparison'
  imageUrl: string
  subStages: StageStep[]
  records: StageRecord[]
  activities: StageActivity[]
}

export interface WorkflowSnapshot {
  tenantId: string
  companyId: string
  templateId: string
  version: number
  enforcementMode: EnforcementMode
  applicabilityNote: string
}
