import Decimal from 'decimal.js'
import { z } from 'zod'
import {
  amendMaterialContractInputSchema,
  materialContractViewSchema,
  recordMaterialContractInputSchema,
  type AmendMaterialContractInput,
  type MaterialContractView,
  type MaterialFinanceCommandResult,
  type RecordMaterialContractInput,
} from '../../../../shared/schemas/costs/material-finance'
import { installmentDueStatus, summarizeMaterialFinance, vietnamToday } from '../../../../shared/utils/material-finance-summary'
import { id, parse, requireFinanceRead, requirePermission, type MaterialFinanceContext } from './service'

export const materialContractFactsSchema = materialContractViewSchema
  .omit({ installments: true, totals: true })
  .extend({
    invoiced: z.string(),
    installments: z.array(z.object({
      installmentKey: z.string().uuid(), seq: z.number().int().positive(), name: z.string().min(1),
      amount: z.string(), dueOn: z.string().date(), isAdvance: z.boolean(), paid: z.string(), pending: z.string(),
    }).strict()).min(1),
  }).strict()
export type MaterialContractFacts = z.infer<typeof materialContractFactsSchema>

export interface MaterialContractDataRepository {
  readContractFacts(context: MaterialFinanceContext, projectId: string, orderId: string): Promise<MaterialContractFacts | null>
  recordContract(context: MaterialFinanceContext, projectId: string, orderId: string, input: RecordMaterialContractInput, key: string): Promise<MaterialFinanceCommandResult>
  amendContract(context: MaterialFinanceContext, projectId: string, contractId: string, input: AmendMaterialContractInput, key: string): Promise<MaterialFinanceCommandResult>
}

export function contractViewFromFacts(facts: MaterialContractFacts, today: string): MaterialContractView {
  const { invoiced, ...rest } = facts
  const current = facts.versions.find(version => version.versionNo === facts.currentVersionNo)
  if (!current) throw new Error('Contract facts are missing the current version')
  return materialContractViewSchema.parse({
    ...rest,
    installments: facts.installments.map(installment => ({
      ...installment,
      remaining: Decimal.max(0, new Decimal(installment.amount).minus(installment.paid).minus(installment.pending)).toFixed(4),
      dueStatus: installmentDueStatus(installment, today),
    })),
    totals: summarizeMaterialFinance([{ total: current.total, invoiced, installments: facts.installments }], today),
  })
}

export class MaterialContractService {
  constructor(
    private readonly repository: MaterialContractDataRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readContract(context: MaterialFinanceContext, projectId: string, orderId: string) {
    requireFinanceRead(context)
    const facts = await this.repository.readContractFacts(context, id(projectId), id(orderId))
    return facts ? contractViewFromFacts(facts, vietnamToday(this.now())) : null
  }

  async recordContract(context: MaterialFinanceContext, projectId: string, orderId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.recordContract(context, id(projectId), id(orderId), parse(recordMaterialContractInputSchema, value), id(key))
  }

  async amendContract(context: MaterialFinanceContext, projectId: string, contractId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.amendContract(context, id(projectId), id(contractId), parse(amendMaterialContractInputSchema, value), id(key))
  }
}
