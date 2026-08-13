import type { ProjectStage, StageStatus } from './journey.types'
import type { ProjectDetail } from '../projects/project.types'

export interface JourneySummary {
  completedStages: number
  totalStages: number
  openSteps: number
  missingRecords: number
}

export const stageStatusLabel: Record<StageStatus, string> = {
  completed: 'Đã hoàn thành',
  active: 'Đang thực hiện',
  upcoming: 'Sắp thực hiện',
  incomplete: 'Chưa đầy đủ',
  not_applicable: 'Không áp dụng',
}

export function summarizeProjectJourney(project: ProjectDetail): JourneySummary {
  return {
    completedStages: project.completedStageCount,
    totalStages: project.totalStageCount,
    openSteps: project.stages.flatMap(stage => stage.subStages)
      .filter(step => step.status !== 'completed' && step.status !== 'not_applicable').length,
    missingRecords: project.stages.reduce((total, stage) => total + stage.missingRecordCount, 0),
  }
}

export function getStageProgress(stage: ProjectStage): number {
  if (stage.totalCount <= 0) return 0
  return Math.round(stage.completedCount / stage.totalCount * 100)
}
