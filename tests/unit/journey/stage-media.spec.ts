import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useStageMedia } from '../../../app/composables/useStageMedia'
import type { ProjectStage } from '../../../app/features/journey/journey.types'
import type { ProjectMedia } from '../../../app/features/media/media.types'

function makeStage(id: string, visualKind: ProjectStage['visualKind']): ProjectStage {
  return {
    tenantId: 'tenant-vqh',
    companyId: 'company-vqh',
    id,
    code: '01',
    name: 'Giai đoạn mẫu',
    purpose: 'Kiểm tra tải hình ảnh.',
    status: 'active',
    completedCount: 1,
    totalCount: 3,
    ownerDepartment: 'Điều phối dự án',
    dueAt: null,
    lastActivityAt: '2026-08-12T09:30:00+07:00',
    requiredRecordCount: 3,
    missingRecordCount: 0,
    visualKind,
    imageUrl: '/mock/thao-dien-cover.svg',
    subStages: [],
    records: [],
    activities: [],
  }
}

function makeMedia(stageId: string): ProjectMedia {
  return {
    tenantId: 'tenant-vqh',
    companyId: 'company-vqh',
    id: 'media-stale',
    stageId,
    kind: 'progress',
    url: '/mock/thao-dien-site-current.svg',
    description: 'Kết quả cũ',
    workArea: 'Tầng trệt',
    capturedAt: '2026-08-12T09:30:00+07:00',
    photographerName: 'Anh Hiếu',
    retainsOriginal: false,
  }
}

describe('stage media loading', () => {
  it('suppresses a stale response and clears loading after focus leaves a comparison stage', async () => {
    const stage = ref(makeStage('stage-construction', 'construction_comparison'))
    const focused = ref(true)
    let resolveDelayedMedia: (media: ProjectMedia[]) => void = () => {}
    const delayedMedia = new Promise<ProjectMedia[]>((resolve) => { resolveDelayedMedia = resolve })
    const repository = { listByStage: () => delayedMedia }

    const state = useStageMedia(stage, focused, repository)
    await nextTick()
    expect(state.pending.value).toBe(true)

    stage.value = makeStage('stage-contract', 'record')
    await nextTick()

    expect(state.pending.value).toBe(false)
    expect(state.media.value).toEqual([])

    resolveDelayedMedia([makeMedia('stage-construction')])
    await Promise.resolve()
    await nextTick()

    expect(state.pending.value).toBe(false)
    expect(state.media.value).toEqual([])
  })
})
