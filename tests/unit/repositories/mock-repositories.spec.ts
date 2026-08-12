import { beforeEach, describe, expect, it } from 'vitest'
import { createMockRepositories } from '../../../app/repositories/mock/mock-repositories'
import { MemoryStateStore } from '../../../app/repositories/mock/state-store'

describe('mock repositories', () => {
  const context = { tenantId: 'tenant-vqh', companyId: 'company-vqh' }
  const repositories = createMockRepositories(new MemoryStateStore(), context)

  beforeEach(async () => repositories.prototype.reset())

  it('keeps exactly one circulating version without erasing approval history', async () => {
    await repositories.drawings.setCurrent('drawing-livingroom-v2')
    const versions = await repositories.drawings.listByStage('stage-design-3d')

    expect(versions.filter(item => item.isCurrent).map(item => item.id))
      .toEqual(['drawing-livingroom-v2'])
    expect(versions.find(item => item.id === 'drawing-livingroom-v1')?.customerApproved)
      .toBe(true)
  })

  it('does not apply a new workflow version to an existing project snapshot', async () => {
    const project = await repositories.projects.getById('project-thao-dien')
    expect(project?.workflowSnapshot.version).toBe(1)
    expect(project?.stages.some(stage => stage.id === 'stage-added-later')).toBe(false)
  })

  it('never returns records from another tenant or company', async () => {
    const projects = await repositories.projects.list()

    expect(projects.every(project =>
      project.tenantId === context.tenantId && project.companyId === context.companyId,
    )).toBe(true)
    expect(projects.some(project => project.id === 'project-other-company-leak-test')).toBe(false)
  })

  it('rejects mutation attempts against another company record', async () => {
    await expect(repositories.tasks.setStatus('task-other-company', 'done'))
      .rejects.toThrow('không thuộc phạm vi công ty')
  })
})
