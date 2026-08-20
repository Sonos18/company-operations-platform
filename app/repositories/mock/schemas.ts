import { z } from 'zod'
import { employeeDetailSchema } from '../../../shared/schemas/employees'
import { CANONICAL_MOCK_EMPLOYEES } from './fixtures'
import type { Company, CompanyConfig, Tenant } from '../../features/companies/company.types'
import type { DrawingFile } from '../../features/drawings/drawing.types'
import type { ProjectMedia } from '../../features/media/media.types'
import type { ProjectDetail } from '../../features/projects/project.types'
import type { ProjectTask } from '../../features/tasks/task.types'
import type { CompanyContext, CompanyMembership, TenantMembership } from '../../features/tenancy/tenancy.types'
import type { EmployeeDetail } from '../../features/employees/employee.types'

export interface MockEmployee extends EmployeeDetail, CompanyContext {
  managerEmployeeId: string | null
}

export interface MockState {
  tenants: Tenant[]
  companies: Company[]
  companyConfigs: CompanyConfig[]
  tenantMemberships: TenantMembership[]
  companyMemberships: CompanyMembership[]
  projects: ProjectDetail[]
  drawings: DrawingFile[]
  media: ProjectMedia[]
  tasks: ProjectTask[]
  employees: MockEmployee[]
}

const scopeSchema = z.object({ tenantId: z.string().min(1), companyId: z.string().min(1) })

const projectSchema = scopeSchema.extend({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  clientName: z.string().min(1),
  location: z.string().min(1),
  coverUrl: z.string().min(1),
  currentStageId: z.string().min(1),
  currentStageName: z.string().min(1),
  completedStageCount: z.number().nonnegative(),
  totalStageCount: z.number().positive(),
  ownerDepartments: z.array(z.string()),
  lastActivityAt: z.string(),
  workflowSnapshot: scopeSchema.extend({
    templateId: z.string(),
    version: z.number().positive(),
    enforcementMode: z.literal('advisory'),
    applicabilityNote: z.string(),
  }),
  stages: z.array(scopeSchema.extend({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    purpose: z.string(),
    status: z.enum(['completed', 'active', 'upcoming', 'incomplete', 'not_applicable']),
    completedCount: z.number().nonnegative(),
    totalCount: z.number().nonnegative(),
    ownerDepartment: z.string(),
    dueAt: z.string().nullable(),
    lastActivityAt: z.string(),
    requiredRecordCount: z.number().nonnegative(),
    missingRecordCount: z.number().nonnegative(),
    visualKind: z.enum(['record', 'drawing', 'construction_comparison']),
    imageUrl: z.string(),
    subStages: z.array(z.object({
      id: z.string(), code: z.string(), name: z.string(),
      status: z.enum(['completed', 'active', 'upcoming', 'incomplete', 'not_applicable']),
      ownerName: z.string(),
    })),
    records: z.array(z.object({
      id: z.string(), label: z.string(),
      kind: z.enum(['form', 'contract', 'document', 'evidence']),
      status: z.enum(['ready', 'missing', 'draft']),
    })),
    activities: z.array(z.object({ id: z.string(), at: z.string(), actorName: z.string(), description: z.string() })),
  })),
})

const drawingSchema = scopeSchema.extend({
  id: z.string(), drawingGroupId: z.string(), stageId: z.string(), code: z.string(),
  category: z.string(), versionNumber: z.number().positive(), originalFilename: z.string(),
  url: z.string(), uploadedAt: z.string(), uploadedByName: z.string(), effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(), isCurrent: z.boolean(), customerApproved: z.boolean(),
  parentFileId: z.string().nullable(),
  relationship: z.enum(['supplement', 'replacement', 'derivation', 'reference']).nullable(),
})

const mediaSchema = scopeSchema.extend({
  id: z.string(), stageId: z.string(), kind: z.enum(['design_target', 'progress', 'evidence']),
  url: z.string(), description: z.string(), workArea: z.string(), capturedAt: z.string(),
  photographerName: z.string(), retainsOriginal: z.boolean(),
})

const taskSchema = scopeSchema.extend({
  id: z.string(), projectId: z.string(), projectName: z.string(), stageId: z.string(), stageName: z.string(),
  title: z.string(), ownerName: z.string(), status: z.enum(['open', 'in_progress', 'waiting', 'done']),
  priority: z.enum(['high', 'medium', 'low']), dueAt: z.string().nullable(),
  assignmentSource: z.enum(['director', 'self_proposed']), relatedRecordLabel: z.string().nullable(),
})

export const mockStateSchema = z.object({
  tenants: z.array(z.object({ id: z.string(), name: z.string(), deploymentMode: z.enum(['shared', 'dedicated']) })),
  companies: z.array(scopeSchema.extend({ code: z.string(), name: z.string() })),
  companyConfigs: z.array(scopeSchema.extend({
    displayName: z.string(), shortName: z.string(),
    brand: z.object({ logoUrl: z.string().nullable(), primaryColor: z.string(), accentColor: z.string() }),
    departments: z.array(z.object({ code: z.string(), name: z.string() })),
    terminology: z.record(z.string(), z.string()), workflowTemplateIds: z.array(z.string()),
  })),
  tenantMemberships: z.array(z.object({ userId: z.string(), tenantId: z.string(), roles: z.array(z.string()) })),
  companyMemberships: z.array(scopeSchema.extend({ userId: z.string(), roles: z.array(z.string()) })),
  projects: z.array(projectSchema),
  drawings: z.array(drawingSchema),
  media: z.array(mediaSchema),
  tasks: z.array(taskSchema),
  employees: z.array(employeeDetailSchema.extend({
    ...scopeSchema.shape,
    managerEmployeeId: z.string().uuid().nullable().default(null),
  })).default(() => structuredClone(CANONICAL_MOCK_EMPLOYEES)),
})

export function validateMockState(input: unknown): MockState {
  const result = mockStateSchema.safeParse(input)
  if (!result.success) {
    throw new Error(`Dữ liệu mẫu không hợp lệ: ${result.error.issues[0]?.message ?? 'không xác định'}`)
  }
  return result.data as MockState
}
