import type Decimal from 'decimal.js'
import type { MaterialContractDocumentation } from '../constants/material-finance'
import { MoneyDecimal } from './money-decimal'

export const MATERIAL_DUE_SOON_DAYS = 3

export interface MaterialInstallmentFacts {
  installmentKey: string
  amount: string
  dueOn: string
  paid: string
  pending: string
}

export interface MaterialContractFacts {
  documentation: MaterialContractDocumentation
  total: string
  invoiced: string
  /** Total of the recorded invoices still in the draft stage; already part of `invoiced`. */
  draftInvoiced: string
  installments: MaterialInstallmentFacts[]
}

export interface MaterialFinanceTotals {
  committed: string
  paid: string
  pending: string
  remaining: string
  overdue: string
  invoiced: string
  draftInvoiced: string
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
  if (new MoneyDecimal(installment.paid).greaterThanOrEqualTo(installment.amount)) return 'settled'
  const days = daysBetween(today, installment.dueOn)
  if (days < 0) return 'overdue'
  return days <= MATERIAL_DUE_SOON_DAYS ? 'due_soon' : 'not_due'
}

/**
 * Aggregates contract facts. `paidWithoutInvoice` is computed on the aggregated
 * totals (max(0, paid - invoiced)), not per contract, per spec section 10. Orders
 * without a contract (`quotation_only`) follow the same flow and take part in it.
 * `invoiced` counts draft and official invoices alike; `draftInvoiced` is the part
 * still waiting for the official file.
 */
export function summarizeMaterialFinance(contracts: readonly MaterialContractFacts[], today: string): MaterialFinanceTotals {
  let committed = new MoneyDecimal(0)
  let paid = new MoneyDecimal(0)
  let pending = new MoneyDecimal(0)
  let overdue = new MoneyDecimal(0)
  let invoiced = new MoneyDecimal(0)
  let draftInvoiced = new MoneyDecimal(0)
  for (const contract of contracts) {
    committed = committed.plus(contract.total)
    invoiced = invoiced.plus(contract.invoiced)
    draftInvoiced = draftInvoiced.plus(contract.draftInvoiced)
    for (const installment of contract.installments) {
      paid = paid.plus(installment.paid)
      pending = pending.plus(installment.pending)
      if (installmentDueStatus(installment, today) === 'overdue') {
        overdue = overdue.plus(MoneyDecimal.max(0, new MoneyDecimal(installment.amount).minus(installment.paid)))
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
    draftInvoiced: money(draftInvoiced),
    paidWithoutInvoice: money(MoneyDecimal.max(0, paid.minus(invoiced))),
  }
}
