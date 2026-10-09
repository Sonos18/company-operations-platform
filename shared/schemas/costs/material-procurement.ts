import Decimal from 'decimal.js'
import { z } from 'zod'
import {
  costEvidenceCreateIntentInputSchema,
} from './cost-evidence'
import type {
  CostEvidenceFinalizeInput,
  CostEvidenceFinalized,
  CostEvidenceReadUrl,
  CostEvidenceReadUrlInput,
  CostEvidenceUploadIntent,
} from './cost-evidence'
import { createBusinessPartyInputSchema } from './master-data'
import {
  workflowCurrencySchema,
  workflowMoneySchema,
  workflowUuidSchema,
} from './cost-workflow'

const text = z.string().trim().min(1).max(2000)
const shortText = z.string().trim().min(1).max(200)
const version = z.number().int().nonnegative()
const positiveDecimal = workflowMoneySchema.refine(value => new Decimal(value).greaterThan(0), 'Must be positive')
const optionalEngineerInvoiceName = z.string().trim().max(200).transform(value => value || null).nullable().optional()
const uniqueBy = <T>(values: T[], identity: (value: T) => string) =>
  new Set(values.map(identity)).size === values.length

export const materialReviewStateSchema = z.enum(['draft', 'submitted', 'approved', 'returned'])
export const materialOrderStateSchema = z.enum(['active', 'suspended', 'cancelled'])

export const chosenSupplierInputSchema = createBusinessPartyInputSchema.extend({
  partyKind: z.literal('organization'),
  supplierAlreadyChosen: z.literal(true),
}).strict()

export const createMaterialInputSchema = z.object({
  code: shortText,
  name: shortText,
  specification: text,
  unit: shortText,
}).strict()

export const updateMaterialInputSchema = z.object({
  expectedVersion: version,
  code: shortText.optional(),
  name: shortText.optional(),
  specification: text.optional(),
  unit: shortText.optional(),
  isActive: z.boolean().optional(),
}).strict().refine(
  value => Object.keys(value).some(key => key !== 'expectedVersion'),
  'At least one material field is required',
)

export const materialViewSchema = createMaterialInputSchema.extend({
  id: workflowUuidSchema,
  isActive: z.boolean(),
  version,
}).strict()

export const materialSupplierNameKindSchema = z.enum(['quotation', 'invoice'])
export const recordMaterialSupplierNameInputSchema = z.object({
  supplierId: workflowUuidSchema,
  documentKind: materialSupplierNameKindSchema,
  name: shortText,
  mappingConfirmed: z.literal(true),
}).strict()
export const materialSupplierNameViewSchema = z.object({
  id: workflowUuidSchema,
  materialId: workflowUuidSchema,
  supplierId: workflowUuidSchema,
  documentKind: materialSupplierNameKindSchema,
  name: shortText,
  version,
}).strict()

export const materialProjectOptionSchema = z.object({
  projectId: workflowUuidSchema,
  code: shortText,
  name: shortText,
  locationText: z.string().nullable(),
}).strict()

export const materialProposalLineInputSchema = z.object({
  lineId: workflowUuidSchema,
  materialId: workflowUuidSchema,
  quantity: positiveDecimal,
  proposedInvoiceName: optionalEngineerInvoiceName,
}).strict()

export const materialProposalInputSchema = z.object({
  neededOn: z.string().date(),
  deliveryAddress: text,
  notes: text.optional(),
  lines: z.array(materialProposalLineInputSchema).min(1).max(1000),
}).strict().refine(
  value => uniqueBy(value.lines, line => line.lineId),
  { path: ['lines'], message: 'Duplicate proposal line identity' },
)

export const updateMaterialProposalInputSchema = materialProposalInputSchema.safeExtend({
  expectedVersion: version,
})

export const materialProposalCommandVersionSchema = z.object({
  expectedVersion: version,
}).strict()

export const setBuyerInvoiceNameInputSchema = z.object({
  revisionId: workflowUuidSchema,
  proposedInvoiceName: shortText.nullable(),
  expectedOverrideVersion: version,
}).strict()

export const materialProposalDecisionInputSchema = z.object({
  expectedVersion: version,
  decision: z.enum(['approve', 'return']),
  reason: text.optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'return' && value.reason === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['reason'],
      message: 'A return requires a reason',
    })
  }
})

export const materialProposalLineViewSchema = materialProposalLineInputSchema.omit({ proposedInvoiceName: true }).extend({
  materialName: shortText,
  engineerProposedInvoiceName: shortText.nullable(),
  buyerProposedInvoiceName: shortText.nullable(),
  effectiveInvoiceDisplayName: shortText,
  invoiceDisplayNameSource: z.enum(['buyer', 'engineer', 'canonical']),
  buyerOverrideVersion: version,
  specification: text,
  unit: shortText,
  allocatedQuantity: workflowMoneySchema,
  signedQuantity: workflowMoneySchema,
  remainingQuantity: workflowMoneySchema,
}).strict()

export const materialProposalViewSchema = z.object({
  id: workflowUuidSchema,
  version,
  reviewState: materialReviewStateSchema,
  returnReason: text.nullable(),
  approvedRevisionId: workflowUuidSchema.nullable(),
  projectId: workflowUuidSchema,
  createdBy: workflowUuidSchema,
  neededOn: z.string().date(),
  deliveryAddress: text,
  notes: z.string().nullable(),
  lines: z.array(materialProposalLineViewSchema).min(1).max(1000),
  orderProgress: z.object({
    orderCount: z.number().int().nonnegative(),
    signedOrderCount: z.number().int().nonnegative(),
  }).strict(),
}).strict().refine(
  value => (value.reviewState === 'returned') === (value.returnReason !== null),
  { path: ['returnReason'], message: 'Only returned proposals require a return reason' },
)

export const materialOrderAllocationInputSchema = z.object({
  proposalLineId: workflowUuidSchema,
  quantity: positiveDecimal,
  unitPrice: positiveDecimal,
  quotationMaterialName: shortText,
  mappingConfirmed: z.literal(true),
}).strict()

export const createMaterialOrderInputSchema = z.object({
  approvedRevisionId: workflowUuidSchema,
  supplierId: workflowUuidSchema,
  currencyCode: workflowCurrencySchema,
  unsignedQuotationEvidenceFileId: workflowUuidSchema,
  allocations: z.array(materialOrderAllocationInputSchema).min(1).max(1000),
}).strict().refine(
  value => uniqueBy(value.allocations, allocation => allocation.proposalLineId),
  { path: ['allocations'], message: 'Duplicate proposal line allocation' },
)

export const materialOrderAllocationViewSchema = materialOrderAllocationInputSchema.extend({
  orderLineId: workflowUuidSchema,
  materialId: workflowUuidSchema,
  materialName: shortText,
  specification: text,
  unit: shortText,
}).strict()

export const cancelMaterialOrderInputSchema = z.object({
  expectedOrderVersion: version,
  reason: text,
}).strict()

export const commitMaterialContractInputSchema = z.object({
  expectedOrderVersion: version,
  contractReference: shortText,
  signedValue: positiveDecimal,
  currencyCode: workflowCurrencySchema,
  signedContractEvidenceFileId: workflowUuidSchema,
  signedQuotationEvidenceFileId: workflowUuidSchema,
  documentsReviewed: z.literal(true),
}).strict()

export const materialOrderViewSchema = z.object({
  id: workflowUuidSchema,
  version,
  orderState: materialOrderStateSchema,
  proposalId: workflowUuidSchema,
  approvedRevisionId: workflowUuidSchema,
  supplierId: workflowUuidSchema,
  supplierName: shortText,
  currencyCode: workflowCurrencySchema,
  allocations: z.array(materialOrderAllocationViewSchema).min(1).max(1000),
  unsignedQuotationEvidenceFileId: workflowUuidSchema,
  contract: z.object({
    id: workflowUuidSchema,
    signedValue: positiveDecimal,
    currencyCode: workflowCurrencySchema,
    authorizationId: workflowUuidSchema,
    installmentId: workflowUuidSchema,
  }).strict().nullable(),
  cash: z.object({
    grossPaid: workflowMoneySchema,
    availableToPay: workflowMoneySchema,
  }).strict(),
}).strict()

export const materialQuotationComparisonInputSchema = z.object({
  proposalLineId: workflowUuidSchema,
  allocationQuantity: positiveDecimal,
  quotedQuantity: positiveDecimal,
}).strict()

export const materialQuotationComparisonViewSchema = materialQuotationComparisonInputSchema.extend({
  varianceQuantity: workflowMoneySchema,
  matchesAllocation: z.boolean(),
}).strict()

export const materialCommandSchema = z.object({
  idempotencyKey: workflowUuidSchema,
}).strict()

export const materialCommandResultSchema = z.object({
  resourceId: workflowUuidSchema,
  version,
  replayed: z.boolean(),
  reviewState: materialReviewStateSchema.optional(),
  contractId: workflowUuidSchema.optional(),
  authorizationId: workflowUuidSchema.optional(),
  installmentId: workflowUuidSchema.optional(),
}).strict()

export const materialEvidenceTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('material_proposal'),
    proposalId: workflowUuidSchema,
    revisionId: workflowUuidSchema,
  }).strict(),
  z.object({
    kind: z.literal('material_order'),
    orderId: workflowUuidSchema,
  }).strict(),
])

export const materialEvidenceRoleSchema = z.enum(['unsigned_quotation', 'signed_quotation', 'signed_contract'])

export const materialEvidenceIntentInputSchema = costEvidenceCreateIntentInputSchema.extend({
  mimeType: z.literal('application/pdf'),
  evidenceRole: materialEvidenceRoleSchema,
  target: materialEvidenceTargetSchema,
}).strict().superRefine((value, context) => {
  const valid = value.target.kind === 'material_proposal'
    ? value.evidenceRole === 'unsigned_quotation'
    : value.evidenceRole === 'signed_quotation' || value.evidenceRole === 'signed_contract'
  if (!valid) context.addIssue({ code: 'custom', path: ['evidenceRole'], message: 'Evidence role does not match target' })
})

export const materialProcurementEndpointManifest = {
  projects: { method: 'GET', path: '/api/companies/:companyId/material-procurement/projects' },
  resolveSupplier: { method: 'POST', path: '/api/companies/:companyId/material-procurement/suppliers/resolve' },
  listMaterials: { method: 'GET', path: '/api/companies/:companyId/material-procurement/materials' },
  createMaterial: { method: 'POST', path: '/api/companies/:companyId/material-procurement/materials' },
  updateMaterial: { method: 'PATCH', path: '/api/companies/:companyId/material-procurement/materials/:materialId' },
  listSupplierNames: { method: 'GET', path: '/api/companies/:companyId/material-procurement/materials/:materialId/supplier-names' },
  recordSupplierName: { method: 'POST', path: '/api/companies/:companyId/material-procurement/materials/:materialId/supplier-names' },
  listProposals: { method: 'GET', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals' },
  createProposal: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals' },
  readProposal: { method: 'GET', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId' },
  updateProposal: { method: 'PATCH', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId' },
  submitProposal: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/submit' },
  decideProposal: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/decisions' },
  setBuyerInvoiceName: { method: 'PATCH', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/lines/:lineId/invoice-name' },
  createOrder: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/orders' },
  listOrders: { method: 'GET', path: '/api/companies/:companyId/projects/:projectId/material-procurement/orders' },
  readOrder: { method: 'GET', path: '/api/companies/:companyId/projects/:projectId/material-procurement/orders/:orderId' },
  cancelOrder: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/orders/:orderId/cancellations' },
  recordContract: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/orders/:orderId/contract' },
  createEvidenceIntent: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/evidence/upload-intents' },
  finalizeEvidence: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/evidence/:fileId/finalize' },
  readEvidenceUrl: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/material-procurement/evidence/:fileId/read-url' },
  payments: { method: 'POST', path: '/api/companies/:companyId/projects/:projectId/cost-workflow/installments/:installmentId/payments' },
} as const

export type ChosenSupplierInput = z.infer<typeof chosenSupplierInputSchema>
export type CreateMaterialInput = z.infer<typeof createMaterialInputSchema>
export type UpdateMaterialInput = z.infer<typeof updateMaterialInputSchema>
export type MaterialView = z.infer<typeof materialViewSchema>
export type RecordMaterialSupplierNameInput = z.infer<typeof recordMaterialSupplierNameInputSchema>
export type MaterialSupplierNameView = z.infer<typeof materialSupplierNameViewSchema>
export type MaterialProjectOption = z.infer<typeof materialProjectOptionSchema>
export type MaterialProposalLineInput = z.infer<typeof materialProposalLineInputSchema>
export type MaterialProposalInput = z.infer<typeof materialProposalInputSchema>
export type UpdateMaterialProposalInput = z.infer<typeof updateMaterialProposalInputSchema>
export type MaterialProposalCommandVersion = z.infer<typeof materialProposalCommandVersionSchema>
export type ProposalDecisionInput = z.infer<typeof materialProposalDecisionInputSchema>
export type SetBuyerInvoiceNameInput = z.infer<typeof setBuyerInvoiceNameInputSchema>
export type MaterialProposalView = z.infer<typeof materialProposalViewSchema>
export type MaterialOrderAllocationInput = z.infer<typeof materialOrderAllocationInputSchema>
export type CreateMaterialOrderInput = z.infer<typeof createMaterialOrderInputSchema>
export type CancelMaterialOrderInput = z.infer<typeof cancelMaterialOrderInputSchema>
export type MaterialOrderState = z.infer<typeof materialOrderStateSchema>
export type MaterialOrderView = z.infer<typeof materialOrderViewSchema>
export type CommitMaterialContractInput = z.infer<typeof commitMaterialContractInputSchema>
export type MaterialQuotationComparisonInput = z.infer<typeof materialQuotationComparisonInputSchema>
export type MaterialQuotationComparisonView = z.infer<typeof materialQuotationComparisonViewSchema>
export type MaterialCommand = z.infer<typeof materialCommandSchema>
export type MaterialCommandResult = z.infer<typeof materialCommandResultSchema>
export type MaterialEvidenceRole = z.infer<typeof materialEvidenceRoleSchema>
export type MaterialEvidenceIntentInput = z.infer<typeof materialEvidenceIntentInputSchema>

export interface MaterialProcurementRepository {
  listProjects(): Promise<MaterialProjectOption[]>
  listMaterials(): Promise<MaterialView[]>
  createMaterial(input: CreateMaterialInput, command: MaterialCommand): Promise<MaterialCommandResult>
  updateMaterial(materialId: string, input: UpdateMaterialInput, command: MaterialCommand): Promise<MaterialCommandResult>
  listSupplierNames(materialId: string): Promise<MaterialSupplierNameView[]>
  recordSupplierName(materialId: string, input: RecordMaterialSupplierNameInput, command: MaterialCommand): Promise<MaterialCommandResult>
  resolveSupplier(input: ChosenSupplierInput, command: MaterialCommand): Promise<MaterialCommandResult>
  listProposals(projectId: string): Promise<MaterialProposalView[]>
  readProposal(projectId: string, proposalId: string): Promise<MaterialProposalView>
  createProposal(projectId: string, input: MaterialProposalInput, command: MaterialCommand): Promise<MaterialCommandResult>
  updateProposal(projectId: string, proposalId: string, input: UpdateMaterialProposalInput, command: MaterialCommand): Promise<MaterialCommandResult>
  submitProposal(projectId: string, proposalId: string, input: MaterialProposalCommandVersion, command: MaterialCommand): Promise<MaterialCommandResult>
  decideProposal(projectId: string, proposalId: string, input: ProposalDecisionInput, command: MaterialCommand): Promise<MaterialCommandResult>
  setBuyerInvoiceName(projectId: string, proposalId: string, lineId: string, input: SetBuyerInvoiceNameInput, command: MaterialCommand): Promise<MaterialCommandResult>
  createOrder(projectId: string, proposalId: string, input: CreateMaterialOrderInput, command: MaterialCommand): Promise<MaterialCommandResult>
  listOrders(projectId: string): Promise<MaterialOrderView[]>
  readOrder(projectId: string, orderId: string): Promise<MaterialOrderView>
  cancelOrder(projectId: string, orderId: string, input: CancelMaterialOrderInput, command: MaterialCommand): Promise<MaterialCommandResult>
  recordContract(projectId: string, orderId: string, input: CommitMaterialContractInput, command: MaterialCommand): Promise<MaterialCommandResult>
  createEvidenceIntent(projectId: string, input: MaterialEvidenceIntentInput, command: MaterialCommand): Promise<CostEvidenceUploadIntent>
  finalizeEvidence(projectId: string, fileId: string, input: CostEvidenceFinalizeInput, command: MaterialCommand): Promise<CostEvidenceFinalized>
  readEvidenceUrl(projectId: string, fileId: string, input?: CostEvidenceReadUrlInput): Promise<CostEvidenceReadUrl>
}
