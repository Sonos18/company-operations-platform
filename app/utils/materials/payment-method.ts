import type { MaterialContractDocumentation } from '../../../shared/constants/material-finance'
import { isMaterialSmallAmount } from '../../../shared/utils/material-small-order'

/**
 * True when a contract total qualifies for cash payment: strictly below 5.000.000 VND (R7).
 * Delegates to isMaterialSmallAmount.
 */
export function canPayInCash(contractTotal: string, currencyCode: string): boolean {
  return isMaterialSmallAmount(contractTotal, currencyCode)
}

/**
 * True only when documentation is 'contract' and the installment is not an advance payment (R6).
 * Quotation-only orders never require an invoice.
 */
export function requestRequiresInvoice(
  documentation: MaterialContractDocumentation,
  isAdvance: boolean,
): boolean {
  return documentation === 'contract' && !isAdvance
}
