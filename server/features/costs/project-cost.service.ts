/* eslint-disable @typescript-eslint/no-explicit-any */
import { correctProjectCostItemInputSchema, createProjectCostItemInputSchema, updateProjectCostItemInputSchema } from '../../../shared/schemas/costs/project-costs'

const fail = (statusCode: number, code: string, details?: unknown) => { throw Object.assign(new Error(code), { statusCode, code, details }) }
export class ProjectCostService {
  constructor(private readonly repository: any) {}
  private require(context: any, permission: string) { if (!context.permissions.includes(permission)) fail(403, 'PERMISSION_DENIED') }
  async listSummaries(context: any) { this.require(context, 'cost.read'); return this.repository.listSummaries(context.tenantId, context.companyId) }
  async projectSummary(context: any, projectId: string) { this.require(context, 'cost.read'); return this.repository.projectSummary(context.tenantId, context.companyId, projectId) }
  async create(context: any, input: unknown, idempotencyKey: string) { this.require(context, 'cost.manage'); return this.repository.create(context, createProjectCostItemInputSchema.parse(input), idempotencyKey) }
  async update(context: any, id: string, input: unknown) { this.require(context, 'cost.manage'); return this.repository.update(context, id, { kind: 'update', input: updateProjectCostItemInputSchema.parse(input) }) }
  async correct(context: any, id: string, input: unknown) { this.require(context, 'cost.correct'); return this.repository.update(context, id, { kind: 'correction', input: correctProjectCostItemInputSchema.parse(input) }) }
}
