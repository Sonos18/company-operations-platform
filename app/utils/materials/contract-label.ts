import type { MaterialContractDocumentation } from '../../../shared/constants/material-finance'

/** "Hợp đồng HD-01", or "Không hợp đồng" for an order recorded from a signed quotation only. */
export function materialContractLabel(contract: {
  documentation: MaterialContractDocumentation
  contractNo: string | null
}): string {
  if (contract.documentation === 'quotation_only') return 'Không hợp đồng'
  return contract.contractNo ? 'Hợp đồng ' + contract.contractNo : 'Hợp đồng'
}

/** The value of a "Số hợp đồng" column: the contract number, or "Không hợp đồng" when there is none. */
export function materialContractNumberText(contract: { contractNo: string | null }): string {
  return contract.contractNo ?? 'Không hợp đồng'
}

/**
 * Counts of the recorded orders of a proposal. `recordedOrderCount` includes orders recorded
 * without a contract, so only the contract status list says how many were signed as contracts.
 */
export function materialRecordedOrdersText(
  recordedOrderCount: number,
  contractStatus: ReadonlyArray<{ documentation: MaterialContractDocumentation }> | undefined,
): string {
  const quotationOnlyCount = contractStatus?.filter(item => item.documentation === 'quotation_only').length ?? 0
  const contractCount = Math.max(recordedOrderCount - quotationOnlyCount, 0)
  const parts: string[] = []
  if (contractCount > 0 || quotationOnlyCount === 0) parts.push(`${contractCount} hợp đồng đã ký kết`)
  if (quotationOnlyCount > 0) parts.push(`${quotationOnlyCount} đơn không hợp đồng đã ghi nhận`)
  return parts.join(', ')
}
