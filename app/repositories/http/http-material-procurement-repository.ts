import { z } from 'zod'
import {
  costEvidenceFinalizeInputSchema,
  costEvidenceFinalizedSchema,
  costEvidenceReadUrlInputSchema,
  costEvidenceReadUrlSchema,
  costEvidenceUploadIntentSchema,
} from '../../../shared/schemas/costs/cost-evidence'
import {
  cancelMaterialOrderInputSchema,
  createMaterialOrderInputSchema,
  chosenSupplierInputSchema,
  createMaterialInputSchema,
  materialCommandSchema,
  materialCommandResultSchema,
  materialEvidenceIntentInputSchema,
  materialOrderViewSchema,
  materialProjectOptionSchema,
  materialProposalCommandVersionSchema,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  materialProposalViewSchema,
  materialSupplierNameViewSchema,
  materialViewSchema,
  recordMaterialSupplierNameInputSchema,
  setBuyerInvoiceNameInputSchema,
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
    setBuyerInvoiceName: async (projectId, proposalId, lineId, input, cmd) => command(project(projectId, '/proposals/' + targetId(proposalId) + '/lines/' + targetId(lineId) + '/invoice-name'), input, setBuyerInvoiceNameInputSchema, materialCommandResultSchema, cmd, 'PATCH'),
    createOrder: async (projectId, proposalId, input, cmd) => command(project(projectId, '/proposals/' + targetId(proposalId) + '/orders'), input, createMaterialOrderInputSchema, materialCommandResultSchema, cmd),
    listOrders: async projectId => read(project(projectId, '/orders'), z.array(materialOrderViewSchema)),
    readOrder: async (projectId, orderId) => read(project(projectId, '/orders/' + targetId(orderId)), materialOrderViewSchema),
    cancelOrder: async (projectId, orderId, input, cmd) => command(project(projectId, '/orders/' + targetId(orderId) + '/cancellations'), input, cancelMaterialOrderInputSchema, materialCommandResultSchema, cmd),
    recordContract: () => unsupported('recordContract'),
    createEvidenceIntent: async (projectId, input, cmd) => command(project(projectId, '/evidence/upload-intents'), input, materialEvidenceIntentInputSchema, costEvidenceUploadIntentSchema, cmd),
    finalizeEvidence: async (projectId, fileId, input, cmd) => command(project(projectId, '/evidence/' + targetId(fileId) + '/finalize'), input, costEvidenceFinalizeInputSchema, costEvidenceFinalizedSchema, cmd),
    readEvidenceUrl: async (projectId, fileId, input = { disposition: 'inline' }) => options.client.request({
      url: project(projectId, '/evidence/' + targetId(fileId) + '/read-url'),
      method: 'POST',
      body: costEvidenceReadUrlInputSchema.parse(input),
      schema: costEvidenceReadUrlSchema,
    }),
  }
}
