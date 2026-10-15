import type Decimal from 'decimal.js'
import { MoneyDecimal } from '../../../shared/utils/money-decimal'

/** Sum of quantity x unit price, rounded once to 4 decimals (half up): the rule the server applies. */
export function computeOrderSubtotal(allocations: ReadonlyArray<{ quantity: string, unitPrice: string }>): Decimal {
  return allocations
    .reduce((acc, line) => acc.plus(new MoneyDecimal(line.quantity).times(line.unitPrice)), new MoneyDecimal(0))
    .toDecimalPlaces(4, MoneyDecimal.ROUND_HALF_UP)
}
