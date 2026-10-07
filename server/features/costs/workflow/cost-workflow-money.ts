import Decimal from 'decimal.js'
import { workflowMoneySchema, type CashSummary, type WorkflowCashFacts } from '../../../../shared/schemas/costs/cost-workflow'

const Money = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })
function money(value: string, scale = 4) {
  if (!workflowMoneySchema.safeParse(value).success) throw new Error('INVALID_WORKFLOW_MONEY')
  const amount = new Money(value)
  if (!Number.isInteger(scale) || scale < 0 || scale > 4 || amount.decimalPlaces() > scale) throw new Error('INVALID_WORKFLOW_MONEY')
  return amount
}
export function evaluateInstallmentCapacity(cap: string, authorized: readonly string[], proposed: string, moneyScale = 4): { allowed: boolean; available: string } {
  const available = money(cap, moneyScale).minus(authorized.reduce((sum, value) => sum.plus(money(value, moneyScale)), new Money(0)))
  if (available.isNegative()) throw new Error('AUTHORIZATION_EXCEEDED')
  return { allowed: money(proposed, moneyScale).lte(available), available: available.toFixed(4) }
}
function unique<T extends { id: string }>(values: readonly T[], identity: (value: T) => string): T[] {
  const seen = new Map<string, { value: T; identity: string }>()
  for (const value of values) {
    const signature = identity(value)
    const existing = seen.get(value.id)
    if (existing && existing.identity !== signature) throw new Error('CONFLICTING_CASH_FACT')
    if (!existing) seen.set(value.id, { value, identity: signature })
  }
  return [...seen.values()].map(value => value.value)
}
export function summarizeWorkflowCash(input: WorkflowCashFacts): CashSummary {
  const parse = (value: string) => money(value, input.moneyScale)
  if ((!Number.isInteger(input.moneyScale) || input.moneyScale < 0 || input.moneyScale > 4) || !Number.isSafeInteger(input.unreconciledCount) || input.unreconciledCount < 0 || !/^[A-Z]{3}$/.test(input.currencyCode)) throw new Error('INVALID_WORKFLOW_MONEY')
  const outgoing = unique(input.outgoing, value => parse(value.validAmount).toFixed(4))
  const refunds = unique(input.refunds, value => value.paymentId + ':' + parse(value.confirmedAmount).toFixed(4))
  const installments = unique(input.installments, value => parse(value.authorized).toFixed(4) + ':' + parse(value.consumed).toFixed(4))
  const outgoingById = new Map(outgoing.map(value => [value.id, parse(value.validAmount)]))
  const receivedByPayment = new Map<string, Decimal>()
  for (const refund of refunds) {
    const received = (receivedByPayment.get(refund.paymentId) ?? new Money(0)).plus(parse(refund.confirmedAmount))
    if (!outgoingById.has(refund.paymentId) || received.gt(outgoingById.get(refund.paymentId)!)) throw new Error('REFUND_EXCEEDS_OUTGOING')
    receivedByPayment.set(refund.paymentId, received)
  }
  const gross = outgoing.reduce((sum, value) => sum.plus(parse(value.validAmount)), new Money(0))
  const received = refunds.reduce((sum, value) => sum.plus(parse(value.confirmedAmount)), new Money(0))
  const remaining = installments.reduce((sum, value) => {
    const balance = parse(value.authorized).minus(parse(value.consumed))
    if (balance.isNegative()) throw new Error('AUTHORIZATION_EXCEEDED')
    return sum.plus(balance)
  }, new Money(0))
  return { grossPaid: gross.toFixed(4), confirmedRefunds: received.toFixed(4), netCash: gross.minus(received).toFixed(4), approvedUnspent: remaining.toFixed(4), unreconciledCount: input.unreconciledCount, coverage: input.coverage }
}
