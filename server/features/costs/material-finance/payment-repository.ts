import { z } from 'zod'
import { materialInvoiceViewSchema, materialPaymentRequestViewSchema } from '../../../../shared/schemas/costs/material-finance'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { financeCommand, financeRead, rpcClient, type MaterialFinanceRpcClient } from './repository'
import type { MaterialPaymentDataRepository } from './payment-service'

const invoiceListSchema = z.array(materialInvoiceViewSchema)
const paymentRequestListSchema = z.array(materialPaymentRequestViewSchema)

export class SupabaseMaterialPaymentRepository implements MaterialPaymentDataRepository {
  private readonly client: MaterialFinanceRpcClient

  constructor(client: UserSupabaseClient) {
    this.client = rpcClient(client)
  }

  listInvoices: MaterialPaymentDataRepository['listInvoices'] = (context, projectId, contractId) =>
    financeRead(this.client, context, 'c1_material_list_invoices', invoiceListSchema, { target_project_id: projectId, target_id: contractId })

  // The default stage is left out so an old database (and an old idempotency receipt) sees the same
  // input as before; only a draft needs the new key.
  recordInvoice: MaterialPaymentDataRepository['recordInvoice'] = (context, projectId, contractId, input, key) => {
    const { stage, ...withoutStage } = input
    return financeCommand(this.client, context, 'c1_material_record_invoice', stage === 'official' ? withoutStage : input, key, {
      target_project_id: projectId,
      target_id: contractId,
    })
  }

  voidInvoice: MaterialPaymentDataRepository['voidInvoice'] = (context, projectId, invoiceId, input, key) =>
    financeCommand(this.client, context, 'c1_material_void_invoice', input, key, { target_project_id: projectId, target_id: invoiceId })

  officializeInvoice: MaterialPaymentDataRepository['officializeInvoice'] = (context, projectId, invoiceId, input, key) =>
    financeCommand(this.client, context, 'c1_material_officialize_invoice', input, key, { target_project_id: projectId, target_id: invoiceId })

  listPaymentRequests: MaterialPaymentDataRepository['listPaymentRequests'] = (context, projectId, contractId) =>
    financeRead(this.client, context, 'c1_material_list_payment_requests', paymentRequestListSchema, { target_project_id: projectId, target_id: contractId })

  createPaymentRequest: MaterialPaymentDataRepository['createPaymentRequest'] = (context, projectId, contractId, input, key) =>
    financeCommand(this.client, context, 'c1_material_create_payment_request', input, key, { target_project_id: projectId, target_id: contractId })

  resubmitPaymentRequest: MaterialPaymentDataRepository['resubmitPaymentRequest'] = (context, projectId, requestId, input, key) =>
    financeCommand(this.client, context, 'c1_material_resubmit_payment_request', input, key, { target_project_id: projectId, target_id: requestId })

  cancelPaymentRequest: MaterialPaymentDataRepository['cancelPaymentRequest'] = (context, projectId, requestId, input, key) =>
    financeCommand(this.client, context, 'c1_material_cancel_payment_request', input, key, { target_project_id: projectId, target_id: requestId })

  decidePaymentRequest: MaterialPaymentDataRepository['decidePaymentRequest'] = (context, projectId, requestId, input, key) =>
    financeCommand(this.client, context, 'c1_material_decide_payment_request', input, key, { target_project_id: projectId, target_id: requestId })

  // The default method is left out so an old database (and an old idempotency receipt) sees the
  // same input as before; only a cash payment needs the new key.
  recordPayment: MaterialPaymentDataRepository['recordPayment'] = (context, projectId, requestId, input, key) => {
    const { method, ...withoutMethod } = input
    return financeCommand(this.client, context, 'c1_material_record_payment', method === 'bank_transfer' ? withoutMethod : input, key, {
      target_project_id: projectId,
      target_id: requestId,
    })
  }
}
