import type { AddDrawingVersionInput, DrawingFile } from '../../features/drawings/drawing.types'
import type { ProjectSummary } from '../../features/projects/project.types'
import type { TaskStatus } from '../../features/tasks/task.types'
import type { CompanyContext } from '../../features/tenancy/tenancy.types'
import type { RepositoryRegistry } from '../contracts'
import { INITIAL_MOCK_STATE } from './fixtures'
import { validateMockState } from './schemas'
import type { MockState } from './schemas'
import type { StateStore } from './state-store'

function inScope(record: CompanyContext, context: CompanyContext): boolean {
  return record.tenantId === context.tenantId && record.companyId === context.companyId
}

function projectSummary(project: MockState['projects'][number]): ProjectSummary {
  const { workflowSnapshot: _workflowSnapshot, stages: _stages, ...summary } = project
  return summary
}

export function createMockRepositories(store: StateStore, context: CompanyContext): RepositoryRegistry {
  const initialState = validateMockState(structuredClone(INITIAL_MOCK_STATE))

  const read = (): MockState => {
    const current = store.read()
    if (current) return validateMockState(current)
    store.write(initialState)
    return structuredClone(initialState)
  }

  const write = (state: MockState) => store.write(validateMockState(state))
  const scopeError = () => new Error('Bản ghi không tồn tại hoặc không thuộc phạm vi công ty hiện tại.')

  return {
    context: Object.freeze({ ...context }),
    company: {
      async getCurrent() {
        const company = read().companies.find(item => inScope(item, context))
        if (!company) throw scopeError()
        return structuredClone(company)
      },
      async getConfig() {
        const config = read().companyConfigs.find(item => inScope(item, context))
        if (!config) throw scopeError()
        return structuredClone(config)
      },
    },
    projects: {
      async list() {
        return read().projects.filter(item => inScope(item, context)).map(projectSummary)
      },
      async getById(projectId) {
        const project = read().projects.find(item => item.id === projectId && inScope(item, context))
        return project ? structuredClone(project) : null
      },
    },
    drawings: {
      async listByStage(stageId) {
        return read().drawings
          .filter(item => item.stageId === stageId && inScope(item, context))
          .sort((left, right) => right.versionNumber - left.versionNumber)
      },
      async addVersion(input: AddDrawingVersionInput): Promise<DrawingFile> {
        const state = read()
        const stageIsVisible = state.projects
          .filter(item => inScope(item, context))
          .some(project => project.stages.some(stage => stage.id === input.stageId))
        if (!stageIsVisible) throw scopeError()
        const group = state.drawings.filter(item => item.drawingGroupId === input.drawingGroupId && inScope(item, context))
        const versionNumber = Math.max(0, ...group.map(item => item.versionNumber)) + 1
        const uploadedAt = new Date().toISOString()
        const drawing: DrawingFile = {
          ...context,
          ...input,
          id: `drawing-${crypto.randomUUID()}`,
          versionNumber,
          uploadedAt,
          uploadedByName: 'Người dùng thử',
          effectiveFrom: uploadedAt,
          effectiveTo: null,
          isCurrent: false,
          customerApproved: false,
        }
        state.drawings.push(drawing)
        write(state)
        return structuredClone(drawing)
      },
      async setCustomerApproved(fileId, approved) {
        const state = read()
        const drawing = state.drawings.find(item => item.id === fileId && inScope(item, context))
        if (!drawing) throw scopeError()
        drawing.customerApproved = approved
        write(state)
      },
      async setCurrent(fileId) {
        const state = read()
        const drawing = state.drawings.find(item => item.id === fileId && inScope(item, context))
        if (!drawing) throw scopeError()
        for (const item of state.drawings) {
          if (item.drawingGroupId === drawing.drawingGroupId && inScope(item, context)) {
            item.isCurrent = item.id === drawing.id
            item.effectiveTo = item.id === drawing.id ? null : drawing.effectiveFrom
          }
        }
        write(state)
      },
    },
    tasks: {
      async listMine() {
        return read().tasks.filter(item => inScope(item, context) && item.status !== 'done')
      },
      async setStatus(taskId: string, status: TaskStatus) {
        const state = read()
        const task = state.tasks.find(item => item.id === taskId && inScope(item, context))
        if (!task) throw scopeError()
        task.status = status
        write(state)
      },
    },
    media: {
      async listByStage(stageId) {
        return read().media
          .filter(item => item.stageId === stageId && inScope(item, context))
          .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))
      },
    },
    prototype: {
      async reset() {
        store.clear()
        store.write(initialState)
      },
    },
  }
}
