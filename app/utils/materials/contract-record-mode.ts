import { isMaterialSmallAmount } from '../../../shared/utils/material-small-order'

/**
 * True when an order qualifies for recording without a contract (quotation only).
 * Orders with total strictly below 5,000,000 VND qualify (R1, R2).
 */
export function canRecordWithoutContract(orderSubtotal: string, currencyCode: string): boolean {
  return isMaterialSmallAmount(orderSubtotal, currencyCode)
}
