import { z } from 'zod'
import {
  chosenSupplierInputSchema,
  createMaterialInputSchema,
  materialCommandSchema,
  materialCommandResultSchema,
  materialProjectOptionSchema,
  materialProposalCommandVersionSchema,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  materialProposalViewSchema,
  materialSupplierNameViewSchema,
  materialViewSchema,
  recordMaterialSupplierNameInputSchema,
  updateMaterialInputSchema,
  updateMaterialProposalInputSchema,
  type MaterialCommand,
} from '../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../shared/schemas/costs/cost-workflow'
import type { MaterialProcurementRepository } from '../material-procurement.contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

export function createHttpMaterialProcurementRepository(options: {
  companyId: string | (() => string | null)
  client: AuthenticatedHttpClient
}): MaterialProcurementRepository {
  function base() {
    const value = typeof options.companyId === 'function' ? options.companyId() : options.companyId
    const parsed = workflowUuidSchema.safeParse(value)
    if (!parsed.success) throw new Error('ACTIVE_COMPANY_REQUIRED')
    return '/api/companies/' + encodeURIComponent(parsed.data)
  }

  const targetId = (value: string) => encodeURIComponent(workflowUuidSchema.parse(value))
  const master = (path: string) => base() + '/material-procurement' + path
  const project = (projectId: string, path: string) =>
    base() + '/projects/' + targetId(projectId) + '/material-procurement' + path

  async function read<T>(url: string, schema: z.ZodType<T>) {
    return options.client.request({ url, method: 'GET', schema })
  }

  async function command<I, T>(
    url: string,
    input: I,
    inputSchema: z.ZodType<I>,
    schema: z.ZodType<T>,
    command: MaterialCommand,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    return options.client.request({
      url,
      method,
      body: inputSchema.parse(input),
      idempotencyKey: materialCommandSchema.parse(command).idempotencyKey,
      schema,
    })
  }

  async function unsupported(operation: string): Promise<never> {
    throw new Error('MATERIAL_PROCUREMENT_NOT_IMPLEMENTED: ' + operation)
  }

  return {
    listProjects: async () => read(master('/projects'), z.array(materialProjectOptionSchema)),
    listMaterials: async () => read(master('/materials'), z.array(materialViewSchema)),
    createMaterial: async (input, cmd) => command(master('/materials'), input, createMaterialInputSchema, materialCommandResultSchema, cmd),
    updateMaterial: async (id, input, cmd) => command(master('/materials/' + targetId(id)), input, updateMaterialInputSchema, materialCommandResultSchema, cmd, 'PATCH'),
    listSupplierNames: async id => read(master('/materials/' + targetId(id) + '/supplier-names'), z.array(materialSupplierNameViewSchema)),
    recordSupplierName: async (id, input, cmd) => command(master('/materials/' + targetId(id) + '/supplier-names'), input, recordMaterialSupplierNameInputSchema, materialCommandResultSchema, cmd),
    resolveSupplier: async (input, cmd) => command(master('/suppliers/resolve'), input, chosenSupplierInputSchema, materialCommandResultSchema, cmd),
    listProposals: async projectId => read(project(projectId, '/proposals'), z.array(materialProposalViewSchema)),
    readProposal: async (projectId, id) => read(project(projectId, '/proposals/' + targetId(id)), materialProposalViewSchema),
    createProposal: async (projectId, input, cmd) => command(project(projectId, '/proposals'), input, materialProposalInputSchema, materialCommandResultSchema, cmd),
    updateProposal: async (projectId, id, input, cmd) => command(project(projectId, '/proposals/' + targetId(id)), input, updateMaterialProposalInputSchema, materialCommandResultSchema, cmd, 'PATCH'),
    submitProposal: async (projectId, id, input, cmd) => command(project(projectId, '/proposals/' + targetId(id) + '/submit'), input, materialProposalCommandVersionSchema, materialCommandResultSchema, cmd),
    decideProposal: async (projectId, id, input, cmd) => command(project(projectId, '/proposals/' + targetId(id) + '/decisions'), input, materialProposalDecisionInputSchema, materialCommandResultSchema, cmd),
    createOrder: () => unsupported('createOrder'),
    listOrders: () => unsupported('listOrders'),
    readOrder: () => unsupported('readOrder'),
    recordContract: () => unsupported('recordContract'),
    createEvidenceIntent: () => unsupported('createEvidenceIntent'),
    finalizeEvidence: () => unsupported('finalizeEvidence'),
    readEvidenceUrl: () => unsupported('readEvidenceUrl'),
  }
}
