import { describe, expect, it } from 'vitest'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'

describe('journey imagery fixture mapping', () => {
  it('maps every Thảo Điền stage and media record to the approved imagery', () => {
    const project = INITIAL_MOCK_STATE.projects.find(item => item.id === 'project-thao-dien')

    expect(project?.coverUrl).toBe('/mock/journey/thao-dien-04-design-approved.webp')
    expect(project?.stages.map(stage => [stage.id, stage.imageUrl])).toEqual([
      ['stage-intake', '/mock/journey/thao-dien-01-intake.webp'],
      ['stage-survey', '/mock/journey/thao-dien-02-survey.webp'],
      ['stage-design-2d', '/mock/journey/thao-dien-03-floor-plan.webp'],
      ['stage-design-3d', '/mock/journey/thao-dien-04-design-approved.webp'],
      ['stage-contract', '/mock/journey/thao-dien-05-preconstruction.webp'],
      ['stage-construction', '/mock/journey/thao-dien-06-site-current.webp'],
      ['stage-handover', '/mock/journey/thao-dien-07-handover.webp'],
    ])
    expect(INITIAL_MOCK_STATE.media.map(item => [item.id, item.url])).toEqual([
      ['media-design-target', '/mock/journey/thao-dien-06-design-target.webp'],
      ['media-site-older', '/mock/journey/thao-dien-06-site-current.webp'],
      ['media-site-current', '/mock/journey/thao-dien-06-site-current.webp'],
      ['media-evidence', '/mock/journey/thao-dien-06-site-current.webp'],
    ])
  })

  it('maps every Vinhomes stage to the approved imagery', () => {
    const project = INITIAL_MOCK_STATE.projects.find(item => item.id === 'project-vinhomes')

    expect(project?.coverUrl).toBe('/mock/journey/vinhomes-03-design.webp')
    expect(project?.stages.map(stage => [stage.id, stage.imageUrl])).toEqual([
      ['vh-stage-intake', '/mock/journey/vinhomes-01-intake.webp'],
      ['vh-stage-survey', '/mock/journey/vinhomes-02-survey.webp'],
      ['vh-stage-design', '/mock/journey/vinhomes-03-design.webp'],
      ['vh-stage-construction', '/mock/journey/vinhomes-04-construction.webp'],
    ])
  })
})
