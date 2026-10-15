import Decimal from 'decimal.js'

/** Sum of quantity x unit price, rounded once to 4 decimals (half up): the rule the server applies. */
export function computeOrderSubtotal(allocations: ReadonlyArray<{ quantity: string, unitPrice: string }>): Decimal {
  return allocations
    .reduce((acc, line) => acc.plus(new Decimal(line.quantity).times(line.unitPrice)), new Decimal(0))
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
}
