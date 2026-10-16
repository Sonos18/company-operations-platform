import { z } from 'zod'
import { workflowUuidSchema } from '../../../shared/schemas/costs/cost-workflow'
import {
  amendMaterialContractInputSchema,
  appNotificationPageSchema,
  cancelPaymentRequestInputSchema,
  createPaymentRequestInputSchema,
  decidePaymentRequestInputSchema,
  materialContractViewSchema,
  materialFinanceCommandResultSchema,
  materialFinanceInboxSchema,
  materialInvoiceViewSchema,
  materialPaymentRequestViewSchema,
  projectMaterialFinanceSummarySchema,
  recordMaterialContractInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  resubmitPaymentRequestInputSchema,
  supplierMaterialFinanceSchema,
  voidMaterialInvoiceInputSchema,
} from '../../../shared/schemas/costs/material-finance'
import { materialCommandSchema } from '../../../shared/schemas/costs/material-procurement'
import type { MaterialFinanceCommand, MaterialFinanceRepository } from '../material-finance.contracts'
import type { AuthenticatedHttpClient } from './authenticated-http-client'

const notificationCursorSchema = z.string().min(1).max(200)
const emptyBodySchema = z.object({}).strict()

export function createHttpMaterialFinanceRepository(options: {
  companyId: string | (() => string | null)
  client: AuthenticatedHttpClient
}): MaterialFinanceRepository {
  function base() {
    const value = typeof options.companyId === 'function' ? options.companyId() : options.companyId
    const parsed = workflowUuidSchema.safeParse(value)
    if (!parsed.success) throw new Error('ACTIVE_COMPANY_REQUIRED')
    return '/api/companies/' + encodeURIComponent(parsed.data)
  }

  const targetId = (value: string) => encodeURIComponent(workflowUuidSchema.parse(value))
  const project = (projectId: string, path: string) =>
    base() + '/projects/' + targetId(projectId) + '/material-procurement' + path

  async function read<T>(url: string, schema: z.ZodType<T>) {
    return options.client.request({ url, method: 'GET', schema })
  }

  async function command<I>(
    url: string,
    input: I,
    inputSchema: z.ZodType<I>,
    command: MaterialFinanceCommand,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    return options.client.request({
      url,
      method,
      body: inputSchema.parse(input),
      idempotencyKey: materialCommandSchema.parse(command).idempotencyKey,
      schema: materialFinanceCommandResultSchema,
    })
  }

  return {
    readContract: async (projectId, orderId) =>
      read(project(projectId, '/orders/' + targetId(orderId) + '/contract'), materialContractViewSchema.nullable()),
    recordContract: async (projectId, orderId, input, cmd) =>
      command(project(projectId, '/orders/' + targetId(orderId) + '/contract'), input, recordMaterialContractInputSchema, cmd),
    amendContract: async (projectId, contractId, input, cmd) =>
      command(project(projectId, '/contracts/' + targetId(contractId) + '/amendments'), input, amendMaterialContractInputSchema, cmd),
    listInvoices: async (projectId, contractId) =>
      read(project(projectId, '/contracts/' + targetId(contractId) + '/invoices'), z.array(materialInvoiceViewSchema)),
    recordInvoice: async (projectId, contractId, input, cmd) =>
      command(project(projectId, '/contracts/' + targetId(contractId) + '/invoices'), input, recordMaterialInvoiceInputSchema, cmd),
    voidInvoice: async (projectId, invoiceId, input, cmd) =>
      command(project(projectId, '/invoices/' + targetId(invoiceId) + '/void'), input, voidMaterialInvoiceInputSchema, cmd),
    listPaymentRequests: async (projectId, contractId) =>
      read(project(projectId, '/contracts/' + targetId(contractId) + '/payment-requests'), z.array(materialPaymentRequestViewSchema)),
    createPaymentRequest: async (projectId, contractId, input, cmd) =>
      command(project(projectId, '/contracts/' + targetId(contractId) + '/payment-requests'), input, createPaymentRequestInputSchema, cmd),
    resubmitPaymentRequest: async (projectId, requestId, input, cmd) =>
      command(project(projectId, '/payment-requests/' + targetId(requestId)), input, resubmitPaymentRequestInputSchema, cmd, 'PATCH'),
    cancelPaymentRequest: async (projectId, requestId, input, cmd) =>
      command(project(projectId, '/payment-requests/' + targetId(requestId) + '/cancel'), input, cancelPaymentRequestInputSchema, cmd),
    decidePaymentRequest: async (projectId, requestId, input, cmd) =>
      command(project(projectId, '/payment-requests/' + targetId(requestId) + '/decisions'), input, decidePaymentRequestInputSchema, cmd),
    recordPayment: async (projectId, requestId, input, cmd) =>
      command(project(projectId, '/payment-requests/' + targetId(requestId) + '/payment'), input, recordMaterialPaymentInputSchema, cmd),
    projectSummary: async projectId =>
      read(project(projectId, '/material-finance/summary'), projectMaterialFinanceSummarySchema),
    inbox: async projectId => read(
      base() + '/material-finance/inbox' + (projectId === undefined ? '' : '?projectId=' + targetId(projectId)),
      materialFinanceInboxSchema,
    ),
    suppliers: async () => read(base() + '/material-finance/suppliers', supplierMaterialFinanceSchema),
    listNotifications: async cursor => read(
      base() + '/notifications' + (cursor === undefined ? '' : '?cursor=' + encodeURIComponent(notificationCursorSchema.parse(cursor))),
      appNotificationPageSchema,
    ),
    readNotification: async (notificationId, cmd) =>
      command(base() + '/notifications/' + targetId(notificationId) + '/read', {}, emptyBodySchema, cmd),
  }
}
