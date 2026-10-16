import {
  cancelPaymentRequestInputSchema,
  createPaymentRequestInputSchema,
  decidePaymentRequestInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  resubmitPaymentRequestInputSchema,
  voidMaterialInvoiceInputSchema,
  type CancelPaymentRequestInput,
  type CreatePaymentRequestInput,
  type DecidePaymentRequestInput,
  type MaterialFinanceCommandResult,
  type MaterialInvoiceView,
  type MaterialPaymentRequestView,
  type RecordMaterialInvoiceInput,
  type RecordMaterialPaymentInput,
  type ResubmitPaymentRequestInput,
  type VoidMaterialInvoiceInput,
} from '../../../../shared/schemas/costs/material-finance'
import { id, parse, requireAnyPermission, requireFinanceRead, requirePermission, type MaterialFinanceContext } from './service'

type Command<T> = (
  context: MaterialFinanceContext, projectId: string, targetId: string, input: T, key: string,
) => Promise<MaterialFinanceCommandResult>

export interface MaterialPaymentDataRepository {
  listInvoices(context: MaterialFinanceContext, projectId: string, contractId: string): Promise<MaterialInvoiceView[]>
  recordInvoice: Command<RecordMaterialInvoiceInput>
  voidInvoice: Command<VoidMaterialInvoiceInput>
  listPaymentRequests(context: MaterialFinanceContext, projectId: string, contractId: string): Promise<MaterialPaymentRequestView[]>
  createPaymentRequest: Command<CreatePaymentRequestInput>
  resubmitPaymentRequest: Command<ResubmitPaymentRequestInput>
  cancelPaymentRequest: Command<CancelPaymentRequestInput>
  decidePaymentRequest: Command<DecidePaymentRequestInput>
  recordPayment: Command<RecordMaterialPaymentInput>
}

export class MaterialPaymentService {
  constructor(private readonly repository: MaterialPaymentDataRepository) {}

  async listInvoices(context: MaterialFinanceContext, projectId: string, contractId: string) {
    requireFinanceRead(context)
    return this.repository.listInvoices(context, id(projectId), id(contractId))
  }

  async recordInvoice(context: MaterialFinanceContext, projectId: string, contractId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.recordInvoice(context, id(projectId), id(contractId), parse(recordMaterialInvoiceInputSchema, value), id(key))
  }

  async voidInvoice(context: MaterialFinanceContext, projectId: string, invoiceId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.voidInvoice(context, id(projectId), id(invoiceId), parse(voidMaterialInvoiceInputSchema, value), id(key))
  }

  async listPaymentRequests(context: MaterialFinanceContext, projectId: string, contractId: string) {
    requireFinanceRead(context)
    return this.repository.listPaymentRequests(context, id(projectId), id(contractId))
  }

  async createPaymentRequest(context: MaterialFinanceContext, projectId: string, contractId: string, value: unknown, key: string) {
    requirePermission(context, 'material.payment.request')
    return this.repository.createPaymentRequest(context, id(projectId), id(contractId), parse(createPaymentRequestInputSchema, value), id(key))
  }

  async resubmitPaymentRequest(context: MaterialFinanceContext, projectId: string, requestId: string, value: unknown, key: string) {
    requirePermission(context, 'material.payment.request')
    return this.repository.resubmitPaymentRequest(context, id(projectId), id(requestId), parse(resubmitPaymentRequestInputSchema, value), id(key))
  }

  async cancelPaymentRequest(context: MaterialFinanceContext, projectId: string, requestId: string, value: unknown, key: string) {
    // Requesters cancel submitted/returned requests, approvers approved ones; the RPC decides by state.
    requireAnyPermission(context, ['material.payment.request', 'material.payment.approve'])
    return this.repository.cancelPaymentRequest(context, id(projectId), id(requestId), parse(cancelPaymentRequestInputSchema, value), id(key))
  }

  async decidePaymentRequest(context: MaterialFinanceContext, projectId: string, requestId: string, value: unknown, key: string) {
    requirePermission(context, 'material.payment.approve')
    return this.repository.decidePaymentRequest(context, id(projectId), id(requestId), parse(decidePaymentRequestInputSchema, value), id(key))
  }

  async recordPayment(context: MaterialFinanceContext, projectId: string, requestId: string, value: unknown, key: string) {
    requirePermission(context, 'material.payment.execute')
    return this.repository.recordPayment(context, id(projectId), id(requestId), parse(recordMaterialPaymentInputSchema, value), id(key))
  }
}
