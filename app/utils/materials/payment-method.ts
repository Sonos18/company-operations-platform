import type { MaterialContractDocumentation } from '../../../shared/constants/material-finance'
import type { MaterialContractView } from '../../../shared/schemas/costs/material-finance'
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

/**
 * Returns the total of the contract's current version, or null if the current version is missing.
 */
export function currentContractTotal(contract: MaterialContractView): string | null {
  const current = contract.versions?.find(v => v.versionNo === contract.currentVersionNo)
  return current?.total ?? null
}
