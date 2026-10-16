import { MATERIAL_SMALL_ORDER_CURRENCY, MATERIAL_SMALL_ORDER_THRESHOLD } from '../constants/material-finance'
import { MoneyDecimal } from './money-decimal'

/**
 * True when an order total qualifies as a small order: strictly below the threshold
 * and in the threshold currency. Exactly the threshold is not small (R1, R2).
 */
export function isMaterialSmallAmount(total: string, currencyCode: string): boolean {
  return currencyCode === MATERIAL_SMALL_ORDER_CURRENCY
    && new MoneyDecimal(total).lessThan(MATERIAL_SMALL_ORDER_THRESHOLD)
}
