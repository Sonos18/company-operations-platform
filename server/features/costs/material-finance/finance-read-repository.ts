import { z } from 'zod'
import { workflowCurrencySchema, workflowMoneySchema, workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { materialContractDocumentationSchema } from '../../../../shared/schemas/costs/material-documentation'
import { appNotificationPageSchema, materialFinanceCommandResultSchema, materialFinanceInboxSchema, notificationReadAllResultSchema, type NotificationReadAllInput } from '../../../../shared/schemas/costs/material-finance'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { financeRead, rpcClient, type MaterialFinanceRpcClient } from './repository'
import type {
  MaterialFinanceFacts,
  MaterialFinanceInboxFacts,
  MaterialFinanceReadDataRepository,
} from './finance-read-service'
import type { MaterialFinanceContext } from './service'

const uuid = workflowUuidSchema
const money = workflowMoneySchema
const date = z.string().date()

const installmentFactsSchema = z.object({
  installmentKey: uuid,
  name: z.string().min(1),
  amount: money,
  dueOn: date,
  paid: money,
  pending: money,
}).strict()

const contractFactsSchema = z.object({
  contractId: uuid,
  projectId: uuid,
  projectName: z.string().min(1),
  proposalNo: z.number().int().positive(),
  orderSeq: z.number().int().positive(),
  orderId: uuid,
  supplierId: uuid,
  supplierName: z.string().min(1),
  documentation: materialContractDocumentationSchema,
  contractNo: z.string().min(1).nullable(),
  total: money,
  invoiced: money,
  draftInvoiced: money,
  installments: z.array(installmentFactsSchema),
}).strict()

export const materialFinanceFactsSchema = z.object({
  currencyCode: workflowCurrencySchema,
  contracts: z.array(contractFactsSchema),
}).strict() satisfies z.ZodType<MaterialFinanceFacts>

export const materialFinanceInboxFactsSchema: z.ZodType<MaterialFinanceInboxFacts> = materialFinanceInboxSchema.omit({ dueInstallments: true })

export class SupabaseMaterialFinanceReadRepository implements MaterialFinanceReadDataRepository {
  private readonly client: MaterialFinanceRpcClient

  constructor(client: UserSupabaseClient) {
    this.client = rpcClient(client)
  }

  financeFacts(context: MaterialFinanceContext, projectId: string | null) {
    return financeRead(this.client, context, 'c1_material_finance_facts', materialFinanceFactsSchema, { target_project_id: projectId })
  }

  inboxFacts(context: MaterialFinanceContext, projectId: string | null) {
    return financeRead(this.client, context, 'c1_material_finance_inbox_facts', materialFinanceInboxFactsSchema, { target_project_id: projectId })
  }

  listNotifications(context: MaterialFinanceContext, cursor: string | null) {
    return financeRead(this.client, context, 'c1_list_app_notifications', appNotificationPageSchema, {
      target_cursor: cursor,
      target_limit: 20,
    })
  }

  // Marking a notification read is naturally idempotent, so the idempotency key is not forwarded.
  readNotification(context: MaterialFinanceContext, id: string, _key: string) {
    return financeRead(this.client, context, 'c1_read_app_notification', materialFinanceCommandResultSchema, { target_id: id })
  }

  readAllNotifications(context: MaterialFinanceContext, input: NotificationReadAllInput) {
    return financeRead(this.client, context, 'c1_mark_notifications_read_all', notificationReadAllResultSchema, {
      target_material_up_to: input.materialUpTo,
      target_cost_up_to: input.costUpTo,
    })
  }
}
