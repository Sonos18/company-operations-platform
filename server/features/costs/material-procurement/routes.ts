import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import {
  chosenSupplierInputSchema,
  createMaterialInputSchema,
  materialProposalCommandVersionSchema,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  recordMaterialSupplierNameInputSchema,
  updateMaterialInputSchema,
  updateMaterialProposalInputSchema,
} from '../../../../shared/schemas/costs/material-procurement'
import { AppApiError } from '../../../utils/api-error'
import { c1RequestContext } from '../../c1-master-data/context'
import { SupabaseMaterialProcurementRepository } from './repository'
import { MaterialProcurementService } from './service'

export interface MaterialProcurementRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
  service?: MaterialProcurementService
}

const uuid = z.string().uuid()

function invalid(): never {
  throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
}

function param(event: H3Event, name: string) {
  const parsed = uuid.safeParse(getRouterParam(event, name))
  return parsed.success ? parsed.data : invalid()
}

function key(event: H3Event) {
  const parsed = uuid.safeParse(getHeader(event, 'idempotency-key'))
  return parsed.success ? parsed.data : invalid()
}

async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readBody(event))
  return parsed.success ? parsed.data : invalid()
}

export function createMaterialProcurementRoutes(dependencies: MaterialProcurementRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    return {
      context,
      service: dependencies.service
        ?? new MaterialProcurementService(new SupabaseMaterialProcurementRepository(context.db)),
    }
  }

  return {
    async listProjects(event: H3Event) { const value = await resolved(event); return value.service.listProjects(value.context) },
    async listMaterials(event: H3Event) { const value = await resolved(event); return value.service.listMaterials(value.context) },
    async createMaterial(event: H3Event) { const value = await resolved(event); return value.service.createMaterial(value.context, await body(event, createMaterialInputSchema), key(event)) },
    async updateMaterial(event: H3Event) { const value = await resolved(event); return value.service.updateMaterial(value.context, param(event, 'materialId'), await body(event, updateMaterialInputSchema), key(event)) },
    async listSupplierNames(event: H3Event) { const value = await resolved(event); return value.service.listSupplierNames(value.context, param(event, 'materialId')) },
    async recordSupplierName(event: H3Event) { const value = await resolved(event); return value.service.recordSupplierName(value.context, param(event, 'materialId'), await body(event, recordMaterialSupplierNameInputSchema), key(event)) },
    async resolveSupplier(event: H3Event) { const value = await resolved(event); return value.service.resolveSupplier(value.context, await body(event, chosenSupplierInputSchema), key(event)) },
    async listProposals(event: H3Event) { const value = await resolved(event); return value.service.listProposals(value.context, param(event, 'projectId')) },
    async readProposal(event: H3Event) { const value = await resolved(event); return value.service.readProposal(value.context, param(event, 'projectId'), param(event, 'proposalId')) },
    async createProposal(event: H3Event) { const value = await resolved(event); return value.service.createProposal(value.context, param(event, 'projectId'), await body(event, materialProposalInputSchema), key(event)) },
    async updateProposal(event: H3Event) { const value = await resolved(event); return value.service.updateProposal(value.context, param(event, 'projectId'), param(event, 'proposalId'), await body(event, updateMaterialProposalInputSchema), key(event)) },
    async submitProposal(event: H3Event) { const value = await resolved(event); return value.service.submitProposal(value.context, param(event, 'projectId'), param(event, 'proposalId'), await body(event, materialProposalCommandVersionSchema), key(event)) },
    async decideProposal(event: H3Event) { const value = await resolved(event); return value.service.decideProposal(value.context, param(event, 'projectId'), param(event, 'proposalId'), await body(event, materialProposalDecisionInputSchema), key(event)) },
  }
}

export function createSupabaseMaterialProcurementRoutes(_event: H3Event) {
  return createMaterialProcurementRoutes({ resolveContext: c1RequestContext })
}
