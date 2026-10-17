import { MoneyDecimal } from '../../../../shared/utils/money-decimal'
import {
  appNotificationPageSchema,
  materialFinanceCommandResultSchema,
  materialFinanceInboxSchema,
  projectMaterialFinanceSummarySchema,
  supplierMaterialFinanceSchema,
  type AppNotificationPage,
  type MaterialFinanceCommandResult,
  type MaterialFinanceInbox,
  type ProjectMaterialFinanceSummary,
  type SupplierMaterialFinance,
} from '../../../../shared/schemas/costs/material-finance'
import {
  installmentDueStatus,
  summarizeMaterialFinance,
  vietnamToday,
  type MaterialContractFacts,
  type MaterialInstallmentFacts,
} from '../../../../shared/utils/material-finance-summary'
import { parse, requireFinanceRead, requirePermission, type MaterialFinanceContext } from './service'

export interface MaterialFinanceInstallmentFacts extends MaterialInstallmentFacts {
  name: string
}

export interface MaterialFinanceContractFacts extends MaterialContractFacts {
  contractId: string
  projectId: string
  projectName: string
  proposalNo: number
  orderSeq: number
  orderId: string
  supplierId: string
  supplierName: string
  contractNo: string | null
  installments: MaterialFinanceInstallmentFacts[]
}

export interface MaterialFinanceFacts {
  currencyCode: string
  contracts: MaterialFinanceContractFacts[]
}

/** Lists the database fills in; `dueInstallments` is derived here from the finance facts. */
export type MaterialFinanceInboxFacts = Omit<MaterialFinanceInbox, 'dueInstallments'>

export interface MaterialFinanceReadDataRepository {
  financeFacts(context: MaterialFinanceContext, projectId: string | null): Promise<MaterialFinanceFacts>
  inboxFacts(context: MaterialFinanceContext, projectId: string | null): Promise<MaterialFinanceInboxFacts>
  listNotifications(context: MaterialFinanceContext, cursor: string | null): Promise<AppNotificationPage>
  readNotification(context: MaterialFinanceContext, id: string, key: string): Promise<MaterialFinanceCommandResult>
}

function contractRow(contract: MaterialFinanceContractFacts, today: string) {
  return {
    contractId: contract.contractId,
    projectId: contract.projectId,
    projectName: contract.projectName,
    proposalNo: contract.proposalNo,
    orderSeq: contract.orderSeq,
    orderId: contract.orderId,
    supplierId: contract.supplierId,
    supplierName: contract.supplierName,
    documentation: contract.documentation,
    contractNo: contract.contractNo,
    totals: summarizeMaterialFinance([contract], today),
  }
}

const byText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

export class MaterialFinanceReadService {
  constructor(
    private readonly repository: MaterialFinanceReadDataRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async projectSummary(context: MaterialFinanceContext, projectId: string): Promise<ProjectMaterialFinanceSummary> {
    requirePermission(context, 'material.finance.read')
    const facts = await this.repository.financeFacts(context, projectId)
    const today = vietnamToday(this.now())
    return parse(projectMaterialFinanceSummarySchema, {
      projectId,
      currencyCode: facts.currencyCode,
      totals: summarizeMaterialFinance(facts.contracts, today),
      contracts: facts.contracts.map(contract => contractRow(contract, today)),
    })
  }

  async suppliers(context: MaterialFinanceContext): Promise<SupplierMaterialFinance> {
    requirePermission(context, 'material.finance.read')
    const facts = await this.repository.financeFacts(context, null)
    const today = vietnamToday(this.now())
    const groups = new Map<string, MaterialFinanceContractFacts[]>()
    for (const contract of facts.contracts) {
      groups.set(contract.supplierId, [...(groups.get(contract.supplierId) ?? []), contract])
    }
    const suppliers = [...groups.entries()].map(([supplierId, contracts]) => ({
      supplierId,
      supplierName: contracts[0]!.supplierName,
      currencyCode: facts.currencyCode,
      totals: summarizeMaterialFinance(contracts, today),
      contracts: contracts.map(contract => contractRow(contract, today)),
    }))
    suppliers.sort((left, right) => left.supplierName.localeCompare(right.supplierName, 'vi') || byText(left.supplierId, right.supplierId))
    return parse(supplierMaterialFinanceSchema, suppliers)
  }

  async inbox(context: MaterialFinanceContext, projectId: string | null = null): Promise<MaterialFinanceInbox> {
    requireFinanceRead(context)
    const [inbox, dueInstallments] = await Promise.all([
      this.repository.inboxFacts(context, projectId),
      this.dueInstallments(context, projectId),
    ])
    return parse(materialFinanceInboxSchema, { ...inbox, dueInstallments })
  }

  listNotifications(context: MaterialFinanceContext, cursor: string | null = null): Promise<AppNotificationPage> {
    return this.repository.listNotifications(context, cursor).then(page => parse(appNotificationPageSchema, page))
  }

  readNotification(context: MaterialFinanceContext, id: string, key: string): Promise<MaterialFinanceCommandResult> {
    return this.repository.readNotification(context, id, key).then(result => parse(materialFinanceCommandResultSchema, result))
  }

  private async dueInstallments(context: MaterialFinanceContext, projectId: string | null): Promise<MaterialFinanceInbox['dueInstallments']> {
    if (!context.permissions.includes('material.contract.record')) return []
    const facts = await this.repository.financeFacts(context, projectId)
    const today = vietnamToday(this.now())
    const rows: MaterialFinanceInbox['dueInstallments'] = []
    for (const contract of facts.contracts) {
      for (const installment of contract.installments) {
        const dueStatus = installmentDueStatus(installment, today)
        if (dueStatus !== 'overdue' && dueStatus !== 'due_soon') continue
        rows.push({
          projectId: contract.projectId,
          projectName: contract.projectName,
          proposalNo: contract.proposalNo,
          orderSeq: contract.orderSeq,
          orderId: contract.orderId,
          supplierName: contract.supplierName,
          contractId: contract.contractId,
          installmentKey: installment.installmentKey,
          name: installment.name,
          dueOn: installment.dueOn,
          remaining: new MoneyDecimal(installment.amount).minus(installment.paid).toFixed(4),
          dueStatus,
        })
      }
    }
    return rows.sort((left, right) => byText(left.dueOn, right.dueOn) || byText(left.contractId, right.contractId))
  }
}
