import type { MaterialContractDocumentation } from '../../../shared/constants/material-finance'
import type { MaterialContractView } from '../../../shared/schemas/costs/material-finance'
import { isMaterialSmallAmount } from '../../../shared/utils/material-small-order'

/**
 * True when a payment qualifies for cash (R7): both the current contract version total and
 * that version's order subtotal snapshot are strictly below 5.000.000 VND. A large order
 * recorded as a contract with a low contract subtotal is not a small order.
 * Delegates to isMaterialSmallAmount.
 */
export function canPayInCash(
  contractTotal: string,
  currencyCode: string,
  orderSubtotalSnapshot: string,
): boolean {
  return isMaterialSmallAmount(contractTotal, currencyCode)
    && isMaterialSmallAmount(orderSubtotalSnapshot, currencyCode)
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
  return currentContractVersion(contract)?.total ?? null
}

/**
 * Returns the order subtotal snapshot of the contract's current version, or null if the
 * current version is missing.
 */
export function currentOrderSubtotalSnapshot(contract: MaterialContractView): string | null {
  return currentContractVersion(contract)?.orderSubtotalSnapshot ?? null
}

function currentContractVersion(contract: MaterialContractView): MaterialContractView['versions'][number] | undefined {
  return contract.versions?.find(v => v.versionNo === contract.currentVersionNo)
}
