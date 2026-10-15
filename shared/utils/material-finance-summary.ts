import Decimal from 'decimal.js'

export const MATERIAL_DUE_SOON_DAYS = 3

export interface MaterialInstallmentFacts {
  installmentKey: string
  amount: string
  dueOn: string
  paid: string
  pending: string
}

export interface MaterialContractFacts {
  total: string
  invoiced: string
  installments: MaterialInstallmentFacts[]
}

export interface MaterialFinanceTotals {
  committed: string
  paid: string
  pending: string
  remaining: string
  overdue: string
  invoiced: string
  paidWithoutInvoice: string
}

export type InstallmentDueStatus = 'settled' | 'overdue' | 'due_soon' | 'not_due'

const money = (value: Decimal) => value.toFixed(4)

export function vietnamToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000)
}

export function installmentDueStatus(installment: MaterialInstallmentFacts, today: string): InstallmentDueStatus {
  if (new Decimal(installment.paid).greaterThanOrEqualTo(installment.amount)) return 'settled'
  const days = daysBetween(today, installment.dueOn)
  if (days < 0) return 'overdue'
  return days <= MATERIAL_DUE_SOON_DAYS ? 'due_soon' : 'not_due'
}

/**
 * Aggregates contract facts. `paidWithoutInvoice` is computed on the aggregated
 * totals (max(0, paid - invoiced)), not per contract, per spec section 10.
 */
export function summarizeMaterialFinance(contracts: readonly MaterialContractFacts[], today: string): MaterialFinanceTotals {
  let committed = new Decimal(0)
  let paid = new Decimal(0)
  let pending = new Decimal(0)
  let overdue = new Decimal(0)
  let invoiced = new Decimal(0)
  for (const contract of contracts) {
    committed = committed.plus(contract.total)
    invoiced = invoiced.plus(contract.invoiced)
    for (const installment of contract.installments) {
      paid = paid.plus(installment.paid)
      pending = pending.plus(installment.pending)
      if (installmentDueStatus(installment, today) === 'overdue') {
        overdue = overdue.plus(Decimal.max(0, new Decimal(installment.amount).minus(installment.paid)))
      }
    }
  }
  return {
    committed: money(committed),
    paid: money(paid),
    pending: money(pending),
    remaining: money(committed.minus(paid)),
    overdue: money(overdue),
    invoiced: money(invoiced),
    paidWithoutInvoice: money(Decimal.max(0, paid.minus(invoiced))),
  }
}
