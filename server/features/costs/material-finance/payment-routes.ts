import type { H3Event } from 'h3'
import {
  cancelPaymentRequestInputSchema,
  createPaymentRequestInputSchema,
  decidePaymentRequestInputSchema,
  officializeMaterialInvoiceInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  resubmitPaymentRequestInputSchema,
  voidMaterialInvoiceInputSchema,
} from '../../../../shared/schemas/costs/material-finance'
import { c1RequestContext } from '../../c1-master-data/context'
import { SupabaseMaterialPaymentRepository } from './payment-repository'
import { MaterialPaymentService } from './payment-service'
import { body, key, param } from './routes'

export interface MaterialPaymentRouteDependencies {
  resolveContext(event: H3Event, companyId: string): ReturnType<typeof c1RequestContext>
  service?: MaterialPaymentService
}

export function createMaterialPaymentRoutes(dependencies: MaterialPaymentRouteDependencies) {
  async function resolved(event: H3Event) {
    const context = await dependencies.resolveContext(event, param(event, 'companyId'))
    return {
      context,
      service: dependencies.service ?? new MaterialPaymentService(new SupabaseMaterialPaymentRepository(context.db)),
    }
  }

  return {
    async listInvoices(event: H3Event) {
      const value = await resolved(event)
      return value.service.listInvoices(value.context, param(event, 'projectId'), param(event, 'contractId'))
    },
    async recordInvoice(event: H3Event) {
      const value = await resolved(event)
      return value.service.recordInvoice(value.context, param(event, 'projectId'), param(event, 'contractId'), await body(event, recordMaterialInvoiceInputSchema), key(event))
    },
    async voidInvoice(event: H3Event) {
      const value = await resolved(event)
      return value.service.voidInvoice(value.context, param(event, 'projectId'), param(event, 'invoiceId'), await body(event, voidMaterialInvoiceInputSchema), key(event))
    },
    async officializeInvoice(event: H3Event) {
      const value = await resolved(event)
      return value.service.officializeInvoice(value.context, param(event, 'projectId'), param(event, 'invoiceId'), await body(event, officializeMaterialInvoiceInputSchema), key(event))
    },
    async listPaymentRequests(event: H3Event) {
      const value = await resolved(event)
      return value.service.listPaymentRequests(value.context, param(event, 'projectId'), param(event, 'contractId'))
    },
    async createPaymentRequest(event: H3Event) {
      const value = await resolved(event)
      return value.service.createPaymentRequest(value.context, param(event, 'projectId'), param(event, 'contractId'), await body(event, createPaymentRequestInputSchema), key(event))
    },
    async resubmitPaymentRequest(event: H3Event) {
      const value = await resolved(event)
      return value.service.resubmitPaymentRequest(value.context, param(event, 'projectId'), param(event, 'requestId'), await body(event, resubmitPaymentRequestInputSchema), key(event))
    },
    async cancelPaymentRequest(event: H3Event) {
      const value = await resolved(event)
      return value.service.cancelPaymentRequest(value.context, param(event, 'projectId'), param(event, 'requestId'), await body(event, cancelPaymentRequestInputSchema), key(event))
    },
    async decidePaymentRequest(event: H3Event) {
      const value = await resolved(event)
      return value.service.decidePaymentRequest(value.context, param(event, 'projectId'), param(event, 'requestId'), await body(event, decidePaymentRequestInputSchema), key(event))
    },
    async recordPayment(event: H3Event) {
      const value = await resolved(event)
      return value.service.recordPayment(value.context, param(event, 'projectId'), param(event, 'requestId'), await body(event, recordMaterialPaymentInputSchema), key(event))
    },
  }
}

export function createSupabaseMaterialPaymentRoutes(_event: H3Event) {
  return createMaterialPaymentRoutes({ resolveContext: c1RequestContext })
}
