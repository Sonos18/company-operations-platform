import { beforeEach, describe, expect, it } from 'vitest'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'
import { createMockRepositories } from '../../../app/repositories/mock/mock-repositories'
import {
  BrowserStateStore,
  type StorageLike,
  MemoryStateStore,
} from '../../../app/repositories/mock/state-store'

const CANONICAL_KEY = 'taskovia:tenant-vqh:company-vqh:prototype:v1'
const LEGACY_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

class FailingReadStorage implements StorageLike {
  private readonly values: Map<string, string>
  readonly writes: Array<{ key: string; value: string }> = []
  readonly removals: string[] = []

  constructor(
    values: Record<string, string>,
    private readonly failingKeys: Set<string>,
  ) {
    this.values = new Map(Object.entries(values))
  }

  getItem(key: string): string | null {
    if (this.failingKeys.has(key)) throw new Error('storage read failed')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes.push({ key, value })
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.removals.push(key)
    this.values.delete(key)
  }

  peek(key: string): string | undefined {
    return this.values.get(key)
  }
}

describe('mock repositories', () => {
  const context = { tenantId: 'tenant-vqh', companyId: 'company-vqh' }
  const repositories = createMockRepositories(new MemoryStateStore(), context)

  beforeEach(async () => repositories.prototype.reset())

  it('keeps Stage 01 out of the legacy mock registry', () => {
    expect(repositories).not.toHaveProperty('opportunities')
    expect(repositories).not.toHaveProperty('workflow')
    expect(repositories).not.toHaveProperty('stage01')
  })

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

  it('fails closed on browser read errors without seeding or overwriting persisted data', async () => {
    const failingKeys = new Set([CANONICAL_KEY])
    const canonicalPayload = JSON.stringify({ ...INITIAL_MOCK_STATE, companies: [] })
    const legacyPayload = JSON.stringify(INITIAL_MOCK_STATE)
    const storage = new FailingReadStorage(
      { [CANONICAL_KEY]: canonicalPayload, [LEGACY_KEY]: legacyPayload },
      failingKeys,
    )
    const browserRepositories = createMockRepositories(
      new BrowserStateStore(storage),
      context,
    )

    await expect(browserRepositories.projects.list()).rejects.toThrow('storage read failed')
    expect(storage.writes).toEqual([])
    expect(storage.removals).toEqual([])

    failingKeys.clear()
    expect(storage.peek(CANONICAL_KEY)).toBe(canonicalPayload)
    expect(storage.peek(LEGACY_KEY)).toBe(legacyPayload)
  })
})
