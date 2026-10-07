import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { readManagerAssignmentProjects } from '../../../app/utils/costs/manager-assignment-projects'
import type { WorkflowDirectory } from '../../../shared/schemas/costs/cost-workflow'

const page = readFileSync(new URL('../../../app/pages/settings/cost-workflow.vue', import.meta.url), 'utf8')
const eo = { projectId: '7e7e3904-d53b-4337-9360-22256887474a', code: 'EO-GIO', name: 'EO GIO', operationalState: 'active' as const }
const ym = { projectId: '22727545-1534-4c1a-9378-06969cb40f97', code: 'YONG-MEI', name: 'Yong Mei', operationalState: 'completed' as const }
const directory = (projects: WorkflowDirectory['projects'], nextCursor: string | null = null): WorkflowDirectory => ({ mode: 'legacy', projects, nextCursor })

describe('Director preparation project selection', () => {
  it('does not couple assignment readers to the administrator-only Project Register', () => {
    expect(page).not.toContain('repositories.projectRegister.list()')
    expect(page).toContain('readManagerAssignmentProjects(repositories.costWorkflow')
    expect(page).toContain("access.hasPermission('project.cost_manager.assign')")
    expect(page).toContain('canConfigure.value ? repo.snapshot()')
    expect(page).toContain('canClassify.value ? repo.crews()')
  })

  it('uses the existing workflow directory in legacy mode and selects only active projects', async () => {
    const readDirectory = vi.fn(async () => directory([ym, eo]))
    expect(await readManagerAssignmentProjects({ readDirectory }, () => true)).toEqual([eo])
    expect(readDirectory).toHaveBeenCalledExactlyOnceWith({ pageSize: 100 })
  })

  it('includes active projects from later authorized pages rather than silently truncating choices', async () => {
    const readDirectory = vi.fn().mockResolvedValueOnce(directory([ym], ym.projectId)).mockResolvedValueOnce(directory([eo]))
    expect(await readManagerAssignmentProjects({ readDirectory }, () => true)).toEqual([eo])
    expect(readDirectory.mock.calls).toEqual([[{ pageSize: 100 }], [{ pageSize: 100, afterId: ym.projectId }]])
  })

  it('does not fetch after the captured company/account scope changes', async () => {
    let current = true
    const readDirectory = vi.fn(async () => { current = false; return directory([eo], eo.projectId) })
    await expect(readManagerAssignmentProjects({ readDirectory }, () => current)).rejects.toThrow('ASSIGNMENT_PROJECT_SCOPE_CHANGED')
    expect(readDirectory).toHaveBeenCalledTimes(1)
  })

  it('rejects overlapping project identities instead of merging inconsistent pages', async () => {
    const readDirectory = vi.fn().mockResolvedValueOnce(directory([eo], eo.projectId)).mockResolvedValueOnce(directory([eo]))
    await expect(readManagerAssignmentProjects({ readDirectory }, () => true)).rejects.toThrow('ASSIGNMENT_PROJECT_DIRECTORY_DUPLICATE')
  })

  it('fails closed on repeated cursors without a follow-up read', async () => {
    const readDirectory = vi.fn().mockResolvedValueOnce(directory([eo], eo.projectId)).mockResolvedValueOnce(directory([], eo.projectId))
    await expect(readManagerAssignmentProjects({ readDirectory }, () => true)).rejects.toThrow('ASSIGNMENT_PROJECT_DIRECTORY_CURSOR')
    expect(readDirectory).toHaveBeenCalledTimes(2)
  })

  it('does not return partial choices when the ten-page bound is exceeded', async () => {
    let cursor = 0
    const readDirectory = vi.fn(async () => directory([], '10000000-0000-4000-8000-' + String(++cursor).padStart(12, '0')))
    await expect(readManagerAssignmentProjects({ readDirectory }, () => true)).rejects.toThrow('ASSIGNMENT_PROJECT_DIRECTORY_LIMIT')
    expect(readDirectory).toHaveBeenCalledTimes(10)
  })

  it('preserves a denied directory response without falling back to another endpoint', async () => {
    const denied = new Error('PERMISSION_DENIED')
    const readDirectory = vi.fn(async () => { throw denied })
    await expect(readManagerAssignmentProjects({ readDirectory }, () => true)).rejects.toBe(denied)
    expect(readDirectory).toHaveBeenCalledTimes(1)
  })
})
