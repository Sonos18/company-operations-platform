import type { Company, CompanyConfig } from '../features/companies/company.types'
import type { AddDrawingVersionInput, DrawingFile } from '../features/drawings/drawing.types'
import type { ProjectMedia } from '../features/media/media.types'
import type { ProjectDetail, ProjectSummary } from '../features/projects/project.types'
import type { ProjectTask, TaskStatus } from '../features/tasks/task.types'
import type { CompanyContext } from '../features/tenancy/tenancy.types'
import type { EmployeeDetail, EmployeeSummary, EmployeeUpdateInput } from '../features/employees/employee.types'

export interface CompanyRepository {
  getCurrent(): Promise<Company>
  getConfig(): Promise<CompanyConfig>
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>
  getById(projectId: string): Promise<ProjectDetail | null>
}

export interface DrawingRepository {
  listByStage(stageId: string): Promise<DrawingFile[]>
  addVersion(input: AddDrawingVersionInput): Promise<DrawingFile>
  setCustomerApproved(fileId: string, approved: boolean): Promise<void>
  setCurrent(fileId: string): Promise<void>
}

export interface TaskRepository {
  listMine(): Promise<ProjectTask[]>
  setStatus(taskId: string, status: TaskStatus): Promise<void>
}

export interface MediaRepository {
  listByStage(stageId: string): Promise<ProjectMedia[]>
}

export interface EmployeeRepository {
  list(): Promise<EmployeeSummary[]>
  getById(employeeId: string): Promise<EmployeeDetail | null>
  update(employeeId: string, input: EmployeeUpdateInput): Promise<EmployeeDetail>
}

export interface PrototypeRepository {
  reset(): Promise<void>
}

export interface RepositoryRegistry {
  context: Readonly<CompanyContext>
  company: CompanyRepository
  projects: ProjectRepository
  drawings: DrawingRepository
  tasks: TaskRepository
  media: MediaRepository
  employees: EmployeeRepository
  prototype: PrototypeRepository
}
