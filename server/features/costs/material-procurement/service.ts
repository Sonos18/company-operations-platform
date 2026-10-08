import type { PermissionCode } from '../../../../shared/constants/permissions'
import {
  costEvidenceFinalizeInputSchema,
  costEvidenceReadUrlInputSchema,
  type CostEvidenceFinalizeInput,
  type CostEvidenceFinalized,
  type CostEvidenceReadUrl,
  type CostEvidenceReadUrlInput,
  type CostEvidenceUploadIntent,
} from '../../../../shared/schemas/costs/cost-evidence'
import {
  cancelMaterialOrderInputSchema,
  createMaterialOrderInputSchema,
  chosenSupplierInputSchema,
  createMaterialInputSchema,
  materialEvidenceIntentInputSchema,
  materialProposalCommandVersionSchema,
  materialProposalDecisionInputSchema,
  materialProposalInputSchema,
  recordMaterialSupplierNameInputSchema,
  updateMaterialInputSchema,
  updateMaterialProposalInputSchema,
  type CancelMaterialOrderInput,
  type CreateMaterialOrderInput,
  type MaterialOrderView,
  type ChosenSupplierInput,
  type CreateMaterialInput,
  type MaterialEvidenceIntentInput,
  type MaterialCommandResult,
  type MaterialProjectOption,
  type MaterialProposalCommandVersion,
  type MaterialProposalInput,
  type MaterialProposalView,
  type MaterialSupplierNameView,
  type MaterialView,
  type ProposalDecisionInput,
  type RecordMaterialSupplierNameInput,
  type UpdateMaterialInput,
  type UpdateMaterialProposalInput,
} from '../../../../shared/schemas/costs/material-procurement'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'

export interface MaterialProcurementContext {
  actorId: string
  tenantId: string
  companyId: string
  permissions: readonly PermissionCode[]
  requestId: string
}

export interface MaterialProcurementDataRepository {
  listProjects(context: MaterialProcurementContext): Promise<MaterialProjectOption[]>
  listMaterials(context: MaterialProcurementContext): Promise<MaterialView[]>
  createMaterial(context: MaterialProcurementContext, input: CreateMaterialInput, key: string): Promise<MaterialCommandResult>
  updateMaterial(context: MaterialProcurementContext, materialId: string, input: UpdateMaterialInput, key: string): Promise<MaterialCommandResult>
  listSupplierNames(context: MaterialProcurementContext, materialId: string): Promise<MaterialSupplierNameView[]>
  recordSupplierName(context: MaterialProcurementContext, materialId: string, input: RecordMaterialSupplierNameInput, key: string): Promise<MaterialCommandResult>
  resolveSupplier(context: MaterialProcurementContext, input: ChosenSupplierInput, key: string): Promise<MaterialCommandResult>
  listProposals(context: MaterialProcurementContext, projectId: string): Promise<MaterialProposalView[]>
  readProposal(context: MaterialProcurementContext, projectId: string, proposalId: string): Promise<MaterialProposalView>
  createProposal(context: MaterialProcurementContext, projectId: string, input: MaterialProposalInput, key: string): Promise<MaterialCommandResult>
  updateProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, input: UpdateMaterialProposalInput, key: string): Promise<MaterialCommandResult>
  submitProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, input: MaterialProposalCommandVersion, key: string): Promise<MaterialCommandResult>
  decideProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, input: ProposalDecisionInput, key: string): Promise<MaterialCommandResult>
  createOrder(context: MaterialProcurementContext, projectId: string, proposalId: string, input: CreateMaterialOrderInput, key: string): Promise<MaterialCommandResult>
  listOrders(context: MaterialProcurementContext, projectId: string): Promise<MaterialOrderView[]>
  readOrder(context: MaterialProcurementContext, projectId: string, orderId: string): Promise<MaterialOrderView>
  cancelOrder(context: MaterialProcurementContext, projectId: string, orderId: string, input: CancelMaterialOrderInput, key: string): Promise<MaterialCommandResult>
  createEvidenceIntent(context: MaterialProcurementContext, projectId: string, input: MaterialEvidenceIntentInput, key: string): Promise<CostEvidenceUploadIntent>
  finalizeEvidence(context: MaterialProcurementContext, projectId: string, fileId: string, input: CostEvidenceFinalizeInput, key: string): Promise<CostEvidenceFinalized>
  readEvidenceUrl(context: MaterialProcurementContext, projectId: string, fileId: string, input: CostEvidenceReadUrlInput): Promise<CostEvidenceReadUrl>
}

function requirePermission(context: MaterialProcurementContext, permission: PermissionCode): void {
  if (!context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

function requireOrderRead(context: MaterialProcurementContext): void {
  if (!context.permissions.some(permission => [
    'material.order.manage', 'material.contract.record', 'cost.notification.read',
  ].includes(permission))) requirePermission(context, 'material.order.manage')
}

function requireEvidenceWrite(context: MaterialProcurementContext): void {
  if (!context.permissions.some(permission => [
    'material.order.manage', 'material.contract.record',
  ].includes(permission))) requirePermission(context, 'material.order.manage')
}

function requireSupplierNameRead(context: MaterialProcurementContext): void {
  if (!context.permissions.includes('material.supplier.record')
    && !context.permissions.includes('material.contract.record')) {
    requirePermission(context, 'material.supplier.record')
  }
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value)
  }
  catch {
    throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  }
}

const id = (value: string) => parse(workflowUuidSchema, value)

export class MaterialProcurementService {
  constructor(private readonly repository: MaterialProcurementDataRepository) {}

  async listProjects(context: MaterialProcurementContext) {
    requirePermission(context, 'material.read')
    return this.repository.listProjects(context)
  }

  async listMaterials(context: MaterialProcurementContext) {
    requirePermission(context, 'material.read')
    return this.repository.listMaterials(context)
  }

  async createMaterial(context: MaterialProcurementContext, value: unknown, key: string) {
    requirePermission(context, 'material.manage')
    return this.repository.createMaterial(context, parse(createMaterialInputSchema, value), id(key))
  }

  async updateMaterial(context: MaterialProcurementContext, materialId: string, value: unknown, key: string) {
    requirePermission(context, 'material.manage')
    return this.repository.updateMaterial(context, id(materialId), parse(updateMaterialInputSchema, value), id(key))
  }

  async listSupplierNames(context: MaterialProcurementContext, materialId: string) {
    requireSupplierNameRead(context)
    return this.repository.listSupplierNames(context, id(materialId))
  }

  async recordSupplierName(context: MaterialProcurementContext, materialId: string, value: unknown, key: string) {
    requirePermission(context, 'material.supplier.record')
    return this.repository.recordSupplierName(context, id(materialId), parse(recordMaterialSupplierNameInputSchema, value), id(key))
  }

  async resolveSupplier(context: MaterialProcurementContext, value: unknown, key: string) {
    requirePermission(context, 'material.supplier.record')
    return this.repository.resolveSupplier(context, parse(chosenSupplierInputSchema, value), id(key))
  }

  async listProposals(context: MaterialProcurementContext, projectId: string) {
    requirePermission(context, 'material.read')
    return this.repository.listProposals(context, id(projectId))
  }

  async readProposal(context: MaterialProcurementContext, projectId: string, proposalId: string) {
    requirePermission(context, 'material.read')
    return this.repository.readProposal(context, id(projectId), id(proposalId))
  }

  async createProposal(context: MaterialProcurementContext, projectId: string, value: unknown, key: string) {
    requirePermission(context, 'material.proposal.submit')
    return this.repository.createProposal(context, id(projectId), parse(materialProposalInputSchema, value), id(key))
  }

  async updateProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, value: unknown, key: string) {
    requirePermission(context, 'material.proposal.submit')
    return this.repository.updateProposal(context, id(projectId), id(proposalId), parse(updateMaterialProposalInputSchema, value), id(key))
  }

  async submitProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, value: unknown, key: string) {
    requirePermission(context, 'material.proposal.submit')
    return this.repository.submitProposal(context, id(projectId), id(proposalId), parse(materialProposalCommandVersionSchema, value), id(key))
  }

  async decideProposal(context: MaterialProcurementContext, projectId: string, proposalId: string, value: unknown, key: string) {
    requirePermission(context, 'material.proposal.decide')
    return this.repository.decideProposal(context, id(projectId), id(proposalId), parse(materialProposalDecisionInputSchema, value), id(key))
  }

  async createOrder(context: MaterialProcurementContext, projectId: string, proposalId: string, value: unknown, key: string) {
    requirePermission(context, 'material.order.manage')
    return this.repository.createOrder(context, id(projectId), id(proposalId), parse(createMaterialOrderInputSchema, value), id(key))
  }

  async listOrders(context: MaterialProcurementContext, projectId: string) {
    requireOrderRead(context)
    return this.repository.listOrders(context, id(projectId))
  }

  async readOrder(context: MaterialProcurementContext, projectId: string, orderId: string) {
    requireOrderRead(context)
    return this.repository.readOrder(context, id(projectId), id(orderId))
  }

  async cancelOrder(context: MaterialProcurementContext, projectId: string, orderId: string, value: unknown, key: string) {
    requirePermission(context, 'material.order.manage')
    return this.repository.cancelOrder(
      context,
      id(projectId),
      id(orderId),
      parse(cancelMaterialOrderInputSchema, value),
      id(key),
    )
  }

  async createEvidenceIntent(context: MaterialProcurementContext, projectId: string, value: unknown, key: string) {
    const input = parse(materialEvidenceIntentInputSchema, value)
    requirePermission(
      context,
      input.evidenceRole === 'unsigned_quotation' ? 'material.order.manage' : 'material.contract.record',
    )
    return this.repository.createEvidenceIntent(context, id(projectId), input, id(key))
  }

  async finalizeEvidence(context: MaterialProcurementContext, projectId: string, fileId: string, value: unknown, key: string) {
    requireEvidenceWrite(context)
    return this.repository.finalizeEvidence(
      context,
      id(projectId),
      id(fileId),
      parse(costEvidenceFinalizeInputSchema, value),
      id(key),
    )
  }

  async readEvidenceUrl(context: MaterialProcurementContext, projectId: string, fileId: string, value: unknown) {
    requireOrderRead(context)
    return this.repository.readEvidenceUrl(
      context,
      id(projectId),
      id(fileId),
      parse(costEvidenceReadUrlInputSchema, value),
    )
  }
}
