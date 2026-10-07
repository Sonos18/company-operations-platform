import type { CostWorkflowRepository } from '../../repositories/cost-workflow.contracts'
import type { WorkflowDirectory } from '../../../shared/schemas/costs/cost-workflow'

/** Load only the existing actor-scoped directory; stop on scope change or incomplete pagination. */
export async function readManagerAssignmentProjects(
  repository: Pick<CostWorkflowRepository, 'readDirectory'>,
  isCurrent: () => boolean,
): Promise<WorkflowDirectory['projects']> {
  const projects: WorkflowDirectory['projects'] = []
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let afterId: string | undefined
  for (let page = 0; page < 10; page += 1) {
    if (!isCurrent()) throw new Error('ASSIGNMENT_PROJECT_SCOPE_CHANGED')
    const directory = await repository.readDirectory({ pageSize: 100, ...(afterId ? { afterId } : {}) })
    if (!isCurrent()) throw new Error('ASSIGNMENT_PROJECT_SCOPE_CHANGED')
    for (const project of directory.projects) {
      if (ids.has(project.projectId)) throw new Error('ASSIGNMENT_PROJECT_DIRECTORY_DUPLICATE')
      ids.add(project.projectId)
      projects.push(project)
    }
    if (!directory.nextCursor) return projects.filter(project => project.operationalState === 'active')
    if (cursors.has(directory.nextCursor)) throw new Error('ASSIGNMENT_PROJECT_DIRECTORY_CURSOR')
    cursors.add(directory.nextCursor)
    afterId = directory.nextCursor
  }
  throw new Error('ASSIGNMENT_PROJECT_DIRECTORY_LIMIT')
}
