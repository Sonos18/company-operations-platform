import { describe, expect, it } from 'vitest'
import {
  extractAllContracts,
  filterActiveContracts,
  buildContractsById,
  canReplaceSubcontractPayment,
  canVoidSubcontractPayment,
  type ContractItem,
} from '../../../app/utils/costs/subcontract-ledger-contracts'
import type {
  FinanceSubcontractDetail,
  FinanceSubcontractorDetail,
} from '../../../shared/schemas/costs/project-finance'

const mockProject = {
  projectId: '10000000-0000-4000-8000-000000000003',
  projectCode: 'DA-C1-01',
  projectName: 'Dự án C1',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'active' as const,
}

const mockParty = {
  partyId: '20000000-0000-4000-8000-000000000004',
  code: 'NT-01',
  displayName: 'Nhà thầu A',
  partyKind: 'organization' as const,
}

const emptyPayments = {
  rows: [],
  pagination: {
    page: 1,
    pageSize: 25,
    totalPages: 1,
    filteredCount: 0,
    fullCount: 0,
    filteredAmount: null,
    fullAmount: null,
  },
  recordedTotal: '0.0000',
  recordedCount: 0,
  recordedRetentionTotal: null,
  recordedRetentionRowCount: 0,
}

describe('Subcontract Ledger Contract Activity (PR #18 Codex P2 Finding)', () => {
  describe('Case A — sole inactive contract', () => {
    it('preserves historical contract in allContracts but excludes it from activeContracts', () => {
      const inactiveContract = {
        id: 'c-inactive-1',
        code: 'HD-01',
        contractNo: '01',
        contractName: 'Hợp đồng cũ đã đóng',
        contractDate: '2026-01-01',
        contractValue: '100000000.0000',
        currencyCode: 'VND',
        defaultRetentionRateBps: 500,
        isActive: false,
        version: 1,
        reference: null,
        sourceReference: null,
        note: null,
        paidTotal: '100000000.0000',
        paidCount: 1,
        recordedRetentionTotal: null,
        recordedRetentionRowCount: 0,
        referenceHeadroom: null,
        referenceHeadroomReason: null,
      }

      const detail: FinanceSubcontractDetail = {
        schemaVersion: 1,
        project: mockProject,
        party: mockParty,
        contract: inactiveContract,
        payments: emptyPayments,
      }

      const all = extractAllContracts(detail)
      const active = filterActiveContracts(all)

      expect(all).toHaveLength(1)
      expect(all[0]?.id).toBe('c-inactive-1')
      expect(all[0]?.isActive).toBe(false)

      // Active contracts is empty: new payment button must be disabled/unavailable
      expect(active).toHaveLength(0)
    })
  })

  describe('Case B — one inactive + one active contract', () => {
    it('exposes only active contracts for new payment creation and selector', () => {
      const contractInactive = {
        id: 'c-inactive-1',
        code: 'HD-01',
        contractNo: '01',
        contractName: 'Hợp đồng 1 (ngừng hoạt động)',
        contractDate: '2026-01-01',
        contractValue: '100000000.0000',
        currencyCode: 'VND',
        defaultRetentionRateBps: null,
        isActive: false,
        version: 1,
        paidTotal: '100000000.0000',
        paidCount: 1,
        recordedRetentionTotal: null,
        recordedRetentionRowCount: 0,
      }

      const contractActive = {
        id: 'c-active-2',
        code: 'HD-02',
        contractNo: '02',
        contractName: 'Hợp đồng 2 (đang hoạt động)',
        contractDate: '2026-06-01',
        contractValue: '200000000.0000',
        currencyCode: 'VND',
        defaultRetentionRateBps: null,
        isActive: true,
        version: 2,
        paidTotal: '50000000.0000',
        paidCount: 1,
        recordedRetentionTotal: null,
        recordedRetentionRowCount: 0,
      }

      const detail: FinanceSubcontractorDetail = {
        schemaVersion: 1,
        project: mockProject,
        party: mockParty,
        contracts: [contractInactive, contractActive],
        payments: emptyPayments,
      }

      const all = extractAllContracts(detail)
      const active = filterActiveContracts(all)

      expect(all).toHaveLength(2)
      // activeContracts has exactly 1 contract: contractActive
      expect(active).toHaveLength(1)
      expect(active[0]?.id).toBe('c-active-2')
      expect(active[0]?.isActive).toBe(true)

      // Inactive contract is NEVER included in actionable active contracts
      expect(active.some(c => c.id === 'c-inactive-1')).toBe(false)
    })

    it('filters out inactive contracts in multi-active selector scenario', () => {
      const contracts: ContractItem[] = [
        { id: 'c1', version: 1, code: 'HD1', contractName: 'Contract 1', isActive: false },
        { id: 'c2', version: 1, code: 'HD2', contractName: 'Contract 2', isActive: true },
        { id: 'c3', version: 1, code: 'HD3', contractName: 'Contract 3', isActive: true },
      ]

      const active = filterActiveContracts(contracts)
      expect(active).toHaveLength(2)
      expect(active.map(c => c.id)).toEqual(['c2', 'c3'])
    })
  })

  describe('Case C — void historical payment on inactive contract', () => {
    it('permits void action on recorded payment under inactive contract when actor has cost.record_cash', () => {
      const payment = {
        recordStatus: 'recorded' as const,
      }
      expect(canVoidSubcontractPayment(payment, true)).toBe(true)
      expect(canVoidSubcontractPayment(payment, false)).toBe(false)
    })
  })

  describe('Case D — replacement under inactive contract', () => {
    it('forbids replacement when payment contract is inactive', () => {
      const contractsById = buildContractsById([
        { id: 'c-inactive', version: 1, code: 'HD1', contractName: 'Contract 1', isActive: false },
      ])

      const payment = {
        recordStatus: 'voided' as const,
        replacementPaymentId: null,
        contractId: 'c-inactive',
      }

      expect(canReplaceSubcontractPayment(payment, contractsById, true)).toBe(false)
    })
  })

  describe('Case E — replacement under active contract', () => {
    it('permits replacement when payment is voided, unreplaced, and contract is active with cost.record_cash', () => {
      const contractsById = buildContractsById([
        { id: 'c-active', version: 1, code: 'HD1', contractName: 'Contract 1', isActive: true },
      ])

      const payment = {
        recordStatus: 'voided' as const,
        replacementPaymentId: null,
        contractId: 'c-active',
      }

      expect(canReplaceSubcontractPayment(payment, contractsById, true)).toBe(true)
      expect(canReplaceSubcontractPayment(payment, contractsById, false)).toBe(false)
    })
  })

  describe('Case F — already replaced payment', () => {
    it('forbids replacement when replacementPaymentId is already set even if contract is active', () => {
      const contractsById = buildContractsById([
        { id: 'c-active', version: 1, code: 'HD1', contractName: 'Contract 1', isActive: true },
      ])

      const payment = {
        recordStatus: 'voided' as const,
        replacementPaymentId: 'new-payment-id-123',
        contractId: 'c-active',
      }

      expect(canReplaceSubcontractPayment(payment, contractsById, true)).toBe(false)
    })
  })
})
