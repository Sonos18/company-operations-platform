import Decimal from 'decimal.js'

export function splitInstallments(total: string, parts: Array<{ percent?: string, amount?: string }>): string[] {
  const totalValue = new Decimal(total)
  const values = parts.map(part => part.amount !== undefined
    ? new Decimal(part.amount)
    : totalValue.times(part.percent ?? '0').dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP))
  if (values.length > 0) {
    const others = values.slice(0, -1).reduce((acc, value) => acc.plus(value), new Decimal(0))
    values[values.length - 1] = totalValue.minus(others)
  }
  return values.map(value => value.toFixed(4))
}
