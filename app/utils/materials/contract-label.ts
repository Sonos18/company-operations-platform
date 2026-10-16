import type { MaterialContractDocumentation } from '../../../shared/constants/material-finance'

/** "Hợp đồng HD-01", or "Không hợp đồng" for an order recorded from a signed quotation only. */
export function materialContractLabel(contract: {
  documentation: MaterialContractDocumentation
  contractNo: string | null
}): string {
  if (contract.documentation === 'quotation_only') return 'Không hợp đồng'
  return contract.contractNo ? 'Hợp đồng ' + contract.contractNo : 'Hợp đồng'
}
