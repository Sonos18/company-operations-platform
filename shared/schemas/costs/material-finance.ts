import Decimal from 'decimal.js'
import { z } from 'zod'
import { workflowCurrencySchema, workflowMoneySchema, workflowUuidSchema } from './cost-workflow'
import { materialContractDocumentationSchema, materialPaymentMethodSchema } from './material-documentation'
import type { MaterialFinanceTotals } from '../../utils/material-finance-summary'

export type { MaterialContractDocumentation, MaterialPaymentMethod } from '../../constants/material-finance'

const uuid = workflowUuidSchema
const version = z.number().int().nonnegative()
const date = z.string().date()
const positiveMoney = workflowMoneySchema.refine(value => new Decimal(value).greaterThan(0), 'Must be positive')
const reason = z.string().trim().min(1).max(1000)
const uniqueBy = <T>(values: T[], identity: (value: T) => string) => new Set(values.map(identity)).size === values.length

export const materialInstallmentInputSchema = z.object({
  installmentKey: uuid,
  name: z.string().trim().min(1).max(200),
  amount: positiveMoney,
  dueOn: date,
  isAdvance: z.boolean(),
}).strict()

const installments = z.array(materialInstallmentInputSchema).min(1).max(50)
  .refine(values => uniqueBy(values, value => value.installmentKey), 'Duplicate installment key')

interface BalancedInput {
  subtotal: string
  vatAmount: string
  total: string
  installments: Array<{ amount: string }>
}

function balanced(value: BalancedInput, context: z.RefinementCtx) {
  if (!new Decimal(value.subtotal).plus(value.vatAmount).equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['total'], message: 'CONTRACT_TOTAL_MISMATCH' })
  }
  const sum = value.installments.reduce((acc, item) => acc.plus(item.amount), new Decimal(0))
  if (!sum.equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['installments'], message: 'INSTALLMENT_TOTAL_MISMATCH' })
  }
}

const contractMoney = {
  subtotal: positiveMoney,
  vatAmount: workflowMoneySchema,
  total: positiveMoney,
  varianceReason: reason.nullable(),
  installments,
}

const recordContractCommon = {
  expectedOrderVersion: version,
  signedOn: date,
  signedQuotationFileId: uuid,
}

const recordWithContractInputSchema = z.object({
  documentation: z.literal('contract'),
  ...recordContractCommon,
  contractNo: z.string().trim().min(1).max(100),
  contractFileId: uuid,
  ...contractMoney,
}).strict().superRefine(balanced)

// No contract number, contract file, VAT, total or installment schedule: the server sets VAT to 0,
// the total to the subtotal and generates the single installment (R3, R4).
const recordQuotationOnlyInputSchema = z.object({
  documentation: z.literal('quotation_only'),
  ...recordContractCommon,
  subtotal: positiveMoney,
  varianceReason: reason.nullable(),
}).strict()

// A body without the discriminator is the pre-small-order shape and means the default branch.
// The key is added before the union, so each branch keeps its own strict key set.
function withDefaultKey(key: string, defaultValue: string) {
  return (input: unknown): unknown => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return input
    return (input as Record<string, unknown>)[key] === undefined ? { ...input, [key]: defaultValue } : input
  }
}

export const recordMaterialContractInputSchema = z.preprocess(
  withDefaultKey('documentation', 'contract'),
  z.discriminatedUnion('documentation', [
    recordWithContractInputSchema,
    recordQuotationOnlyInputSchema,
  ]),
)

export const amendMaterialContractInputSchema = z.object({
  expectedVersion: version,
  amendmentFileId: uuid,
  reason,
  ...contractMoney,
}).strict().superRefine(balanced)

export const recordMaterialInvoiceInputSchema = z.object({
  invoiceSymbol: z.string().trim().min(1).max(20),
  invoiceNo: z.string().trim().min(1).max(50),
  issuedOn: date,
  subtotal: positiveMoney,
  vatAmount: workflowMoneySchema,
  total: positiveMoney,
  fileId: uuid,
  lines: z.array(z.object({
    proposalLineId: uuid,
    invoiceMaterialName: z.string().trim().min(1).max(300),
  }).strict()).max(1000),
}).strict().superRefine((value, context) => {
  if (!new Decimal(value.subtotal).plus(value.vatAmount).equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['total'], message: 'INVOICE_TOTAL_MISMATCH' })
  }
  if (!uniqueBy(value.lines, line => line.proposalLineId)) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Duplicate invoice line' })
  }
})

export const voidMaterialInvoiceInputSchema = z.object({ expectedVersion: version, reason }).strict()

const requestBody = {
  amount: positiveMoney,
  invoiceIds: z.array(uuid).max(50).refine(values => new Set(values).size === values.length, 'Duplicate invoice'),
  note: z.string().trim().max(1000).transform(value => value || null).nullable(),
}

export const createPaymentRequestInputSchema = z.object({ installmentKey: uuid, ...requestBody }).strict()
export const resubmitPaymentRequestInputSchema = z.object({ expectedVersion: version, ...requestBody }).strict()
export const cancelPaymentRequestInputSchema = z.object({ expectedVersion: version, reason }).strict()
export const decidePaymentRequestInputSchema = z.object({
  expectedVersion: version,
  decision: z.enum(['approve', 'return']),
  reason: reason.optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'return' && value.reason === undefined) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A return requires a reason' })
  }
  // material_payment_decisions stores a reason only for returns; the database rejects it on approvals.
  if (value.decision === 'approve' && value.reason !== undefined) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'An approval carries no reason' })
  }
})
const recordPaymentCommon = {
  expectedVersion: version,
  paidOn: date,
  proofFileId: uuid,
}

export const recordMaterialPaymentInputSchema = z.preprocess(
  withDefaultKey('method', 'bank_transfer'),
  z.discriminatedUnion('method', [
    z.object({
      method: z.literal('bank_transfer'),
      ...recordPaymentCommon,
      bankReference: z.string().trim().min(1).max(100),
    }).strict(),
    z.object({
      method: z.literal('cash'),
      ...recordPaymentCommon,
      // A blank reference is the same as none; anything else is refused (the database agrees).
      bankReference: z.string().trim().nullable()
        .transform(value => value === '' ? null : value)
        .refine(value => value === null, 'A cash payment carries no bank reference'),
    }).strict(),
  ]),
)

export const materialFinanceTotalsSchema = z.object({
  committed: workflowMoneySchema,
  paid: workflowMoneySchema,
  pending: workflowMoneySchema,
  remaining: z.string().regex(/^-?(?:0|[1-9]\d{0,15})\.\d{4}$/),
  overdue: workflowMoneySchema,
  invoiced: workflowMoneySchema,
  paidWithoutInvoice: workflowMoneySchema,
}).strict() satisfies z.ZodType<MaterialFinanceTotals>

export const installmentDueStatusSchema = z.enum(['settled', 'overdue', 'due_soon', 'not_due'])

export const materialInstallmentViewSchema = materialInstallmentInputSchema.extend({
  seq: z.number().int().positive(),
  paid: workflowMoneySchema,
  pending: workflowMoneySchema,
  // amount − paid − pending: what a new payment request may still ask for ("Còn có thể đề nghị").
  remaining: workflowMoneySchema,
  dueStatus: installmentDueStatusSchema,
}).strict()

export const materialContractVersionViewSchema = z.object({
  versionNo: z.number().int().positive(),
  kind: z.enum(['original', 'amendment']),
  subtotal: workflowMoneySchema,
  vatAmount: workflowMoneySchema,
  total: workflowMoneySchema,
  orderSubtotalSnapshot: workflowMoneySchema,
  varianceReason: z.string().nullable(),
  contractFileId: uuid.nullable(),
  signedQuotationFileId: uuid.nullable(),
  reason: z.string().nullable(),
  recordedBy: uuid,
  recordedAt: z.string().datetime({ offset: true }),
}).strict()

export const materialContractViewSchema = z.object({
  id: uuid,
  orderId: uuid,
  projectId: uuid,
  supplierId: uuid,
  supplierName: z.string().min(1),
  currencyCode: workflowCurrencySchema,
  documentation: materialContractDocumentationSchema,
  contractNo: z.string().min(1).nullable(),
  signedOn: date,
  currentVersionNo: z.number().int().positive(),
  version,
  versions: z.array(materialContractVersionViewSchema).min(1),
  installments: z.array(materialInstallmentViewSchema).min(1),
  totals: materialFinanceTotalsSchema,
}).strict()

export const materialInvoiceViewSchema = z.object({
  id: uuid,
  contractId: uuid,
  invoiceSymbol: z.string().min(1),
  invoiceNo: z.string().min(1),
  issuedOn: date,
  subtotal: workflowMoneySchema,
  vatAmount: workflowMoneySchema,
  total: workflowMoneySchema,
  fileId: uuid,
  state: z.enum(['recorded', 'voided']),
  voidReason: z.string().nullable(),
  version,
  lines: z.array(z.object({ proposalLineId: uuid, invoiceMaterialName: z.string().min(1) }).strict()),
}).strict()

export const paymentRequestStateSchema = z.enum(['submitted', 'returned', 'approved', 'paid', 'cancelled'])

export const materialPaymentRequestViewSchema = z.object({
  id: uuid,
  contractId: uuid,
  installmentKey: uuid,
  amount: workflowMoneySchema,
  note: z.string().nullable(),
  state: paymentRequestStateSchema,
  revisionNo: z.number().int().positive(),
  submittedBy: uuid,
  submittedAt: z.string().datetime({ offset: true }),
  invoiceIds: z.array(uuid),
  cancelReason: z.string().nullable(),
  version,
  decisions: z.array(z.object({
    revisionNo: z.number().int().positive(),
    decision: z.enum(['approve', 'return']),
    reason: z.string().nullable(),
    decidedBy: uuid,
    decidedAt: z.string().datetime({ offset: true }),
  }).strict()),
  payment: z.object({
    id: uuid,
    paidOn: date,
    method: materialPaymentMethodSchema,
    bankReference: z.string().min(1).nullable(),
    proofFileId: uuid,
    paidBy: uuid,
    recordedAt: z.string().datetime({ offset: true }),
  }).strict().nullable(),
}).strict()

const contractRow = z.object({
  contractId: uuid,
  projectId: uuid,
  orderId: uuid,
  supplierId: uuid,
  supplierName: z.string().min(1),
  documentation: materialContractDocumentationSchema,
  contractNo: z.string().min(1).nullable(),
  totals: materialFinanceTotalsSchema,
}).strict()

export const projectMaterialFinanceSummarySchema = z.object({
  projectId: uuid,
  currencyCode: workflowCurrencySchema,
  totals: materialFinanceTotalsSchema,
  contracts: z.array(contractRow),
}).strict()

export const supplierMaterialFinanceSchema = z.array(z.object({
  supplierId: uuid,
  supplierName: z.string().min(1),
  currencyCode: workflowCurrencySchema,
  totals: materialFinanceTotalsSchema,
  contracts: z.array(contractRow),
}).strict())

const inboxBase = { projectId: uuid, projectName: z.string().min(1), orderId: uuid, supplierName: z.string().min(1) }
export const materialFinanceInboxSchema = z.object({
  awaitingContract: z.array(z.object({ ...inboxBase, orderSubtotal: workflowMoneySchema, createdAt: z.string().datetime({ offset: true }) }).strict()),
  dueInstallments: z.array(z.object({
    ...inboxBase, contractId: uuid, installmentKey: uuid, name: z.string().min(1),
    // amount − paid: what is still owed on the installment ("Còn phải trả"), pending requests included.
    dueOn: date, remaining: workflowMoneySchema, dueStatus: z.enum(['overdue', 'due_soon']),
  }).strict()),
  returnedRequests: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, reason: z.string().min(1) }).strict()),
  pendingApproval: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, submittedBy: uuid, submittedAt: z.string().datetime({ offset: true }) }).strict()),
  approvedAwaitingPayment: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, approvedAt: z.string().datetime({ offset: true }) }).strict()),
}).strict()

export const appNotificationEventKindSchema = z.enum([
  'material.order.created',
  'material.contract.recorded',
  'material.contract.amended',
  'material.installment.due_soon',
  'material.installment.overdue',
  'material.payment.submitted',
  'material.payment.returned',
  'material.payment.paid',
])

export const appNotificationViewSchema = z.object({
  id: uuid,
  eventKind: appNotificationEventKindSchema,
  projectId: uuid.nullable(),
  linkPath: z.string().startsWith('/'),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  createdAt: z.string().datetime({ offset: true }),
  readAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const appNotificationPageSchema = z.object({
  items: z.array(appNotificationViewSchema),
  nextCursor: z.string().min(1).max(200).nullable(),
}).strict()

export const materialFinanceCommandResultSchema = z.object({
  resourceId: uuid,
  version,
  replayed: z.boolean(),
}).strict()

const project = '/api/companies/:companyId/projects/:projectId/material-procurement'
export const materialFinanceEndpointManifest = {
  readContract: { method: 'GET', path: project + '/orders/:orderId/contract' },
  recordContract: { method: 'POST', path: project + '/orders/:orderId/contract' },
  amendContract: { method: 'POST', path: project + '/contracts/:contractId/amendments' },
  listInvoices: { method: 'GET', path: project + '/contracts/:contractId/invoices' },
  recordInvoice: { method: 'POST', path: project + '/contracts/:contractId/invoices' },
  voidInvoice: { method: 'POST', path: project + '/invoices/:invoiceId/void' },
  listPaymentRequests: { method: 'GET', path: project + '/contracts/:contractId/payment-requests' },
  createPaymentRequest: { method: 'POST', path: project + '/contracts/:contractId/payment-requests' },
  resubmitPaymentRequest: { method: 'PATCH', path: project + '/payment-requests/:requestId' },
  cancelPaymentRequest: { method: 'POST', path: project + '/payment-requests/:requestId/cancel' },
  decidePaymentRequest: { method: 'POST', path: project + '/payment-requests/:requestId/decisions' },
  recordPayment: { method: 'POST', path: project + '/payment-requests/:requestId/payment' },
  projectSummary: { method: 'GET', path: project + '/material-finance/summary' },
  inbox: { method: 'GET', path: '/api/companies/:companyId/material-finance/inbox' },
  suppliers: { method: 'GET', path: '/api/companies/:companyId/material-finance/suppliers' },
  listNotifications: { method: 'GET', path: '/api/companies/:companyId/notifications' },
  readNotification: { method: 'POST', path: '/api/companies/:companyId/notifications/:notificationId/read' },
} as const

export type MaterialInstallmentInput = z.infer<typeof materialInstallmentInputSchema>
export type RecordMaterialContractInput = z.infer<typeof recordMaterialContractInputSchema>
export type AmendMaterialContractInput = z.infer<typeof amendMaterialContractInputSchema>
export type RecordMaterialInvoiceInput = z.infer<typeof recordMaterialInvoiceInputSchema>
export type VoidMaterialInvoiceInput = z.infer<typeof voidMaterialInvoiceInputSchema>
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestInputSchema>
export type ResubmitPaymentRequestInput = z.infer<typeof resubmitPaymentRequestInputSchema>
export type CancelPaymentRequestInput = z.infer<typeof cancelPaymentRequestInputSchema>
export type DecidePaymentRequestInput = z.infer<typeof decidePaymentRequestInputSchema>
export type RecordMaterialPaymentInput = z.infer<typeof recordMaterialPaymentInputSchema>
export type MaterialInstallmentView = z.infer<typeof materialInstallmentViewSchema>
export type MaterialContractView = z.infer<typeof materialContractViewSchema>
export type MaterialInvoiceView = z.infer<typeof materialInvoiceViewSchema>
export type MaterialPaymentRequestView = z.infer<typeof materialPaymentRequestViewSchema>
export type ProjectMaterialFinanceSummary = z.infer<typeof projectMaterialFinanceSummarySchema>
export type SupplierMaterialFinance = z.infer<typeof supplierMaterialFinanceSchema>
export type MaterialFinanceInbox = z.infer<typeof materialFinanceInboxSchema>
export type AppNotificationView = z.infer<typeof appNotificationViewSchema>
export type AppNotificationPage = z.infer<typeof appNotificationPageSchema>
export type MaterialFinanceCommandResult = z.infer<typeof materialFinanceCommandResultSchema>
export interface MaterialFinanceCommand { idempotencyKey: string }

export interface MaterialFinanceRepository {
  readContract(projectId: string, orderId: string): Promise<MaterialContractView | null>
  recordContract(projectId: string, orderId: string, input: RecordMaterialContractInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  amendContract(projectId: string, contractId: string, input: AmendMaterialContractInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  listInvoices(projectId: string, contractId: string): Promise<MaterialInvoiceView[]>
  recordInvoice(projectId: string, contractId: string, input: RecordMaterialInvoiceInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  voidInvoice(projectId: string, invoiceId: string, input: VoidMaterialInvoiceInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  listPaymentRequests(projectId: string, contractId: string): Promise<MaterialPaymentRequestView[]>
  createPaymentRequest(projectId: string, contractId: string, input: CreatePaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  resubmitPaymentRequest(projectId: string, requestId: string, input: ResubmitPaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  cancelPaymentRequest(projectId: string, requestId: string, input: CancelPaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  decidePaymentRequest(projectId: string, requestId: string, input: DecidePaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  recordPayment(projectId: string, requestId: string, input: RecordMaterialPaymentInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  projectSummary(projectId: string): Promise<ProjectMaterialFinanceSummary>
  inbox(projectId?: string): Promise<MaterialFinanceInbox>
  suppliers(): Promise<SupplierMaterialFinance>
  listNotifications(cursor?: string): Promise<AppNotificationPage>
  readNotification(notificationId: string, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
}
