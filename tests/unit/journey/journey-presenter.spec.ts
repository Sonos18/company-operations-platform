import { describe, expect, it } from 'vitest'
import type { ProjectStage } from '../../../app/features/journey/journey.types'
import type { ProjectDetail } from '../../../app/features/projects/project.types'
import {
  getStageProgress,
  stageStatusLabel,
  summarizeProjectJourney,
} from '../../../app/features/journey/journey.presenter'

function makeStage(status: ProjectStage['status'], missingRecordCount: number): ProjectStage {
  return {
    tenantId: 'tenant-vqh',
    companyId: 'company-vqh',
    id: `stage-${status}`,
    code: '01',
    name: 'Giai đoạn mẫu',
    purpose: 'Kiểm tra trình bày hành trình.',
    status,
    completedCount: status === 'completed' ? 2 : 1,
    totalCount: 2,
    ownerDepartment: 'Điều phối dự án',
    dueAt: null,
    lastActivityAt: '2026-08-12T09:30:00+07:00',
    requiredRecordCount: 2,
    missingRecordCount,
    visualKind: 'record',
    imageUrl: '/mock/thao-dien-cover.svg',
    subStages: [
      { id: 'done', code: '01.1', name: 'Đã xong', status: 'completed', ownerName: 'Anh Long' },
      { id: 'open', code: '01.2', name: 'Đang mở', status: 'active', ownerName: 'Chị Nhi' },
      { id: 'skip', code: '01.3', name: 'Không áp dụng', status: 'not_applicable', ownerName: 'Chị Nhi' },
    ],
    records: [],
    activities: [],
  }
}

describe('journey presenter', () => {
  it('summarizes only existing project workflow data', () => {
    const stages = [makeStage('completed', 0), makeStage('active', 2)]
    const project = {
      completedStageCount: 1,
      totalStageCount: 2,
      stages,
    } as ProjectDetail

    expect(summarizeProjectJourney(project)).toEqual({
      completedStages: 1,
      totalStages: 2,
      openSteps: 2,
      missingRecords: 2,
    })
  })

  it('returns a safe percentage for empty and populated stages', () => {
    expect(getStageProgress({ completedCount: 1, totalCount: 2 } as ProjectStage)).toBe(50)
    expect(getStageProgress({ completedCount: 0, totalCount: 0 } as ProjectStage)).toBe(0)
  })

  it('provides Vietnamese labels for every stage state', () => {
    expect(stageStatusLabel).toEqual({
      completed: 'Đã hoàn thành',
      active: 'Đang thực hiện',
      upcoming: 'Sắp thực hiện',
      incomplete: 'Chưa đầy đủ',
      not_applicable: 'Không áp dụng',
    })
  })
})
