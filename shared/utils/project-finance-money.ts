import Decimal from 'decimal.js'

const Money = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP })

export function sumFinanceMoney(values: readonly string[]): string {
  return values.reduce((total, value) => total.plus(value), new Money(0)).toFixed(4)
}

export function subtractFinanceMoney(base: string, deductions: readonly string[]): string {
  return deductions.reduce((value, deduction) => value.minus(deduction), new Money(base)).toFixed(4)
}

export function computeConfirmedMargin(input: {
  basis: 'revenue_estimate' | 'cost_budget' | 'unconfirmed'
  approvedReference: string | null
  cost: string | null
  retention: string | null
}): string | null {
  if (input.basis !== 'revenue_estimate' || input.approvedReference === null || input.cost === null || input.retention === null) return null
  return subtractFinanceMoney(input.approvedReference, [input.cost, input.retention])
}
