import type { FinanceSubcontractDetail, FinanceSubcontractorDetail } from '../../../shared/schemas/costs/project-finance'

export interface ContractItem {
  id: string
  version: number
  code: string
  contractName: string
  isActive: boolean
  currencyCode?: string
}

export function extractAllContracts(detail: FinanceSubcontractDetail | FinanceSubcontractorDetail | null | undefined): ContractItem[] {
  if (!detail) return []
  if ('contract' in detail && detail.contract) {
    return [{
      id: detail.contract.id,
      version: detail.contract.version,
      code: detail.contract.code,
      contractName: detail.contract.contractName,
      isActive: detail.contract.isActive,
      currencyCode: detail.contract.currencyCode,
    }]
  }
  if ('contracts' in detail && Array.isArray(detail.contracts)) {
    return detail.contracts.map(c => ({
      id: c.id,
      version: c.version,
      code: c.code,
      contractName: c.contractName,
      isActive: c.isActive,
      currencyCode: c.currencyCode,
    }))
  }
  return []
}

export function filterActiveContracts(contracts: ContractItem[]): ContractItem[] {
  return contracts.filter(c => c.isActive === true)
}

export function buildContractsById(contracts: ContractItem[]): Map<string, ContractItem> {
  const map = new Map<string, ContractItem>()
  for (const c of contracts) {
    map.set(c.id, c)
  }
  return map
}

export function canReplaceSubcontractPayment(
  payment: { recordStatus: string; replacementPaymentId?: string | null; contractId: string },
  contractsById: Map<string, ContractItem>,
  canRecordCash: boolean,
): boolean {
  if (!canRecordCash) return false
  if (payment.recordStatus !== 'voided') return false
  if (payment.replacementPaymentId != null) return false
  const contract = contractsById.get(payment.contractId)
  return contract?.isActive === true
}

export function canVoidSubcontractPayment(
  payment: { recordStatus: string },
  canRecordCash: boolean,
): boolean {
  return canRecordCash && payment.recordStatus === 'recorded'
}
