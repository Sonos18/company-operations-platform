import { describe, expect, it } from 'vitest'
import {
  categoryDisplayName,
  computePageRetentionBreakdown,
  computeProjectKpiCards,
  formatCostDisplay,
  formatDateProvenance,
  formatFinanceMoney,
  formatManagementHeadline,
  formatMarginReasons,
  formatOperationalState,
  formatOwnerReceiptsDisplay,
  formatProvisionalProfitDisplay,
  formatReferenceDisplay,
  formatRetentionCount,
  formatWarrantyRetentionDisplay,
} from '../../../app/utils/costs/finance-display'

describe('finance display helpers', () => {
  describe('formatFinanceMoney', () => {
    it('returns null for null and undefined rather than zero', () => {
      expect(formatFinanceMoney(null)).toBeNull()
      expect(formatFinanceMoney(undefined)).toBeNull()
      expect(formatFinanceMoney('')).toBeNull()
      expect(formatFinanceMoney('   ')).toBeNull()
    })

    it('formats recorded zero as "0" rather than null', () => {
      expect(formatFinanceMoney('0.0000')).toBe('0')
      expect(formatFinanceMoney('0.0000', 'VND')).toBe('0 VND')
      expect(formatFinanceMoney('0')).toBe('0')
    })

    it('formats large positive and negative amounts with commas and currency', () => {
      expect(formatFinanceMoney('242562376.0000', 'VND')).toBe('242,562,376 VND')
      expect(formatFinanceMoney('1234567.8900', 'USD')).toBe('1,234,567.89 USD')
      expect(formatFinanceMoney('-500000.0000', 'VND')).toBe('-500,000 VND')
    })

    it('honors moneyScale when positive', () => {
      expect(formatFinanceMoney('100.5000', 'USD', 2)).toBe('100.5 USD')
      expect(formatFinanceMoney('100.0000', 'USD', 2)).toBe('100 USD')
    })
  })

  describe('formatDateProvenance', () => {
    it('formats valid business dates without system fallback badge', () => {
      const res = formatDateProvenance('2026-08-15', 'business_date')
      expect(res.dateText).toBe('15/08/2026')
      expect(res.isSystemFallback).toBe(false)
      expect(res.badgeLabel).toBeUndefined()
    })

    it('badges created_at fallback as "Ngày nhập hệ thống"', () => {
      const res = formatDateProvenance('2026-08-20', 'created_at')
      expect(res.dateText).toBe('20/08/2026')
      expect(res.isSystemFallback).toBe(true)
      expect(res.badgeLabel).toBe('Ngày nhập hệ thống')
    })

    it('returns dash for null or empty dates', () => {
      expect(formatDateProvenance(null, null).dateText).toBe('—')
      expect(formatDateProvenance('', null).dateText).toBe('—')
    })
  })

  describe('formatMarginReasons', () => {
    it('maps known reason codes to Vietnamese explanations', () => {
      const reasons = ['NO_APPROVED_BUDGET', 'COST_INCOMPLETE']
      const formatted = formatMarginReasons(reasons)
      expect(formatted).toBe('Chưa có dự toán được duyệt · Dữ liệu chi phí chưa đầy đủ')
    })

    it('handles empty reasons gracefully', () => {
      expect(formatMarginReasons([])).toBe('Chưa có thông tin dự toán và chi phí')
      expect(formatMarginReasons(null)).toBe('Chưa có thông tin dự toán và chi phí')
    })
  })

  describe('formatRetentionCount', () => {
    it('formats count as "N khoản", never as contractors', () => {
      expect(formatRetentionCount(0)).toBe('0 khoản')
      expect(formatRetentionCount(1)).toBe('1 khoản')
      expect(formatRetentionCount(5)).toBe('5 khoản')
    })
  })

  describe('formatOperationalState', () => {
    it('maps all four lifecycle states accurately to Vietnamese badges', () => {
      expect(formatOperationalState('active')).toEqual({ label: 'Đang thực hiện', badgeVariant: 'cockpit-badge--warning' })
      expect(formatOperationalState('completed')).toEqual({ label: 'Hoàn thành', badgeVariant: 'cockpit-badge--success' })
      expect(formatOperationalState('paused')).toEqual({ label: 'Tạm dừng', badgeVariant: 'cockpit-badge--neutral' })
      expect(formatOperationalState('unknown')).toEqual({ label: 'Chưa cập nhật trạng thái', badgeVariant: 'cockpit-badge--neutral' })
      expect(formatOperationalState(null)).toEqual({ label: 'Chưa cập nhật trạng thái', badgeVariant: 'cockpit-badge--neutral' })
    })
  })

  describe('formatProvisionalProfitDisplay', () => {
    it('formats positive provisional profit with emerald green and basis', () => {
      const res = formatProvisionalProfitDisplay({
        result: { state: 'provisional', amount: '350000000.0000', basis: 'owner_receipts' },
        costState: 'recorded',
        resultReasons: [],
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Lợi nhuận tạm tính')
      expect(res.value).toBe('350,000,000 VND')
      expect(res.isAvailable).toBe(true)
      expect(res.isNegative).toBe(false)
      expect(res.colorScheme).toBe('provisional')
      expect(res.caption).toBe('Theo số đã thu')
      expect(res.tooltipText).toContain('Lợi nhuận tạm tính = Thu từ CĐT - Chi phí ghi nhận - Bảo hành')
    })

    it('formats negative provisional profit with red danger styling', () => {
      const res = formatProvisionalProfitDisplay({
        result: { state: 'provisional', amount: '-30000000.0000', basis: 'owner_receipts' },
        costState: 'recorded',
        resultReasons: [],
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Lợi nhuận tạm tính')
      expect(res.value).toBe('-30,000,000 VND')
      expect(res.isAvailable).toBe(true)
      expect(res.isNegative).toBe(true)
      expect(res.colorScheme).toBe('danger')
    })

    it('includes partial cost caveat in tooltip when cost needs reconciliation', () => {
      const res = formatProvisionalProfitDisplay({
        result: { state: 'provisional', amount: '150000000.0000', basis: 'owner_receipts' },
        costState: 'needs_reconciliation',
        resultReasons: [],
        currencyCode: 'VND',
      })
      expect(res.tooltipText).toContain('Chi phí chưa đối soát đầy đủ')
    })

    it('formats unavailable profit as "Chưa đủ dữ liệu" with reasons', () => {
      const res = formatProvisionalProfitDisplay({
        result: { state: 'unavailable', amount: null, reasons: ['COST_INCOMPLETE'] },
        costState: 'not_recorded',
        resultReasons: ['COST_INCOMPLETE'],
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Lợi nhuận tạm tính')
      expect(res.value).toBe('Chưa đủ dữ liệu')
      expect(res.isAvailable).toBe(false)
      expect(res.colorScheme).toBe('unavailable')
      expect(res.tooltipText).toContain('Dữ liệu chi phí chưa đầy đủ')
    })
  })

  describe('formatManagementHeadline', () => {
    it('formats provisional result with basis', () => {
      const headline = { kind: 'provisional_result' as const, amount: '45000000.0000', basis: 'provisional_owner_receipts_result' }
      const res = formatManagementHeadline(headline, null, [], [], 'VND')
      expect(res.label).toBe('Kết quả tạm tính')
      expect(res.value).toBe('45,000,000 VND')
      expect(res.caption).toBe('Theo số đã thu')
      expect(res.isAvailable).toBe(true)
      expect(res.colorScheme).toBe('provisional')
      expect(res.reasons).toBeNull()
    })

    it('formats owner receipts headline without persistent caption', () => {
      const headline = { kind: 'owner_receipts' as const, amount: '200000000.0000', basis: 'recorded_owner_receipts' }
      const receipts = { quality: 'accounting_source_unverified', coverage: 'recorded_rows_only' }
      const res = formatManagementHeadline(headline, receipts, ['COST_INCOMPLETE'], ['NO_APPROVED_BUDGET'], 'VND')
      expect(res.label).toBe('Thu từ chủ đầu tư')
      expect(res.value).toBe('200,000,000 VND')
      expect(res.caption).toBeNull()
      expect(res.isAvailable).toBe(true)
      expect(res.colorScheme).toBe('receipts')
      expect(res.reasons).toBeNull()
    })

    it('formats unavailable headline with margin reasons', () => {
      const headline = { kind: 'unavailable' as const, amount: null, basis: 'none' }
      const res = formatManagementHeadline(headline, null, ['NO_REFERENCE'], ['NO_APPROVED_BUDGET', 'COST_INCOMPLETE'], 'VND')
      expect(res.label).toBe('Lợi nhuận dự kiến')
      expect(res.value).toBe('Chưa tính được')
      expect(res.caption).toBeNull()
      expect(res.isAvailable).toBe(false)
      expect(res.colorScheme).toBe('unavailable')
      expect(res.reasons).toBe('Chưa có dự toán được duyệt · Dữ liệu chi phí chưa đầy đủ')
    })
  })

  describe('formatReferenceDisplay', () => {
    it('formats approved_budget kind with blue badge', () => {
      const res = formatReferenceDisplay({ kind: 'approved_budget', amount: '500000000.0000' }, 'VND')
      expect(res.label).toBe('Dự toán được duyệt')
      expect(res.value).toBe('500,000,000 VND')
      expect(res.isOwnerReceipts).toBe(false)
      expect(res.badgeVariant).toBe('cockpit-badge--primary')
      expect(res.colorScheme).toBe('budget')
      expect(res.warningMessage).toBeNull()
      expect(res.visibleCaption).toBeNull()
    })

    it('formats owner_receipts kind with green badge and compact tooltip without inline paragraphs', () => {
      const res = formatReferenceDisplay(
        { kind: 'owner_receipts', amount: '200000000.0000' },
        'VND',
        0,
        'accounting_source_unverified',
      )
      expect(res.label).toBe('Thu từ chủ đầu tư')
      expect(res.value).toBe('200,000,000 VND')
      expect(res.isOwnerReceipts).toBe(true)
      expect(res.badgeVariant).toBe('cockpit-badge--accent')
      expect(res.colorScheme).toBe('receipts')
      expect(res.warningMessage).toBeNull()
      expect(res.visibleCaption).toBeNull()
      expect(res.tooltipText).toBe('Số tham chiếu là khoản thu từ chủ đầu tư, không phải dự toán.')
    })

    it('formats none kind as "Dự toán" + "Chưa ghi nhận"', () => {
      const res = formatReferenceDisplay({ kind: 'none', amount: null })
      expect(res.label).toBe('Dự toán')
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.isOwnerReceipts).toBe(false)
    })
  })

  describe('formatCostDisplay', () => {
    it('formats recorded state with amount', () => {
      const res = formatCostDisplay({
        cost: { state: 'recorded', amount: '120000000.0000' },
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Chi phí')
      expect(res.value).toBe('120,000,000 VND')
      expect(res.knownSubtotal).toBeNull()
      expect(res.sublineLabel).toBeNull()
    })

    it('formats not_recorded state with "Chưa ghi nhận"', () => {
      const res = formatCostDisplay({
        cost: { state: 'not_recorded', amount: null },
      })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.sublineLabel).toBeNull()
    })

    it('formats not_recorded state with knownSubtotal of 0.0000 as "Chưa ghi nhận" without subline', () => {
      const res = formatCostDisplay({
        cost: { state: 'not_recorded', amount: null, knownSubtotal: '0.0000' },
      })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.knownSubtotal).toBeNull()
      expect(res.sublineLabel).toBeNull()
    })

    it('formats needs_reconciliation state with known amount and stateLabel without prefix', () => {
      const res = formatCostDisplay({
        cost: { state: 'needs_reconciliation', amount: null, knownSubtotal: '50000000.0000' },
        currencyCode: 'VND',
      })
      expect(res.value).toBe('50,000,000 VND')
      expect(res.stateLabel).toBe('Chưa đối soát')
      expect(res.knownSubtotal).toBe('50,000,000 VND')
      expect(res.sublineLabel).toBe('50,000,000 VND')
    })
  })

  describe('formatWarrantyRetentionDisplay', () => {
    it('formats recorded warranty retention with amount, row count, and warranty badge', () => {
      const res = formatWarrantyRetentionDisplay({
        warranty: { state: 'recorded', amount: '15000000.0000', recordedCount: 2 },
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Bảo hành đã ghi nhận')
      expect(res.value).toBe('15,000,000 VND')
      expect(res.countText).toBe('(2 khoản)')
      expect(res.badgeVariant).toBe('cockpit-badge--warranty')
    })

    it('formats not_recorded warranty retention with row count', () => {
      const res = formatWarrantyRetentionDisplay({
        warranty: { state: 'not_recorded', amount: null, recordedCount: 0 },
      })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.countText).toBe('(0 khoản)')
    })

    it('formats needs_reconciliation warranty retention with row count', () => {
      const res = formatWarrantyRetentionDisplay({
        warranty: { state: 'needs_reconciliation', amount: null, recordedCount: 1 },
      })
      expect(res.value).toBe('Chưa đối soát')
      expect(res.countText).toBe('(1 khoản)')
    })
  })

  describe('categoryDisplayName', () => {
    it('returns standard Vietnamese category names', () => {
      expect(categoryDisplayName('materials', 'materials')).toBe('Vật liệu')
      expect(categoryDisplayName('machinery', 'machinery')).toBe('Máy thi công')
      expect(categoryDisplayName('direct_labor', 'direct_labor')).toBe('Nhân công trực tiếp')
      expect(categoryDisplayName('subcontract_labor', 'subcontract_labor')).toBe('Nhân công thầu phụ')
      expect(categoryDisplayName('other', 'other')).toBe('Chi phí khác')
    })

    it('preserves existing custom database name when provided', () => {
      expect(categoryDisplayName('materials', 'Vật liệu xây dựng phần thô')).toBe('Vật liệu xây dựng phần thô')
    })
  })

  describe('formatOwnerReceiptsDisplay (R06)', () => {
    it('shows receipts amount when budget and receipts are both present', () => {
      const res = formatOwnerReceiptsDisplay({
        receipts: { state: 'recorded', amount: '300000000.0000', recordedCount: 3 },
        budget: { state: 'recorded', amount: '1000000000.0000' },
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Thu từ chủ đầu tư')
      expect(res.value).toBe('300,000,000 VND')
      expect(res.isAvailable).toBe(true)
      expect(res.colorScheme).toBe('receipts')
      expect(res.budgetSecondaryText).toBe('Dự toán: 1,000,000,000 VND')
    })

    it('shows "Chưa ghi nhận" for budget-only project without receipts (never budget amount)', () => {
      const res = formatOwnerReceiptsDisplay({
        receipts: { state: 'not_recorded', amount: null, recordedCount: 0 },
        budget: { state: 'recorded', amount: '500000000.0000' },
        currencyCode: 'VND',
      })
      expect(res.label).toBe('Thu từ chủ đầu tư')
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.isAvailable).toBe(false)
      expect(res.colorScheme).toBe('neutral')
      expect(res.budgetSecondaryText).toBe('Dự toán: 500,000,000 VND')
    })

    it('shows receipts without budget secondary text when no budget exists', () => {
      const res = formatOwnerReceiptsDisplay({
        receipts: { state: 'recorded', amount: '250000000.0000', recordedCount: 1 },
        budget: { state: 'not_recorded', amount: null },
        currencyCode: 'VND',
      })
      expect(res.value).toBe('250,000,000 VND')
      expect(res.budgetSecondaryText).toBeNull()
    })

    it('formats recorded zero receipts distinctly as "0 VND"', () => {
      const res = formatOwnerReceiptsDisplay({
        receipts: { state: 'recorded', amount: '0.0000', recordedCount: 1 },
        currencyCode: 'VND',
      })
      expect(res.value).toBe('0 VND')
      expect(res.isAvailable).toBe(true)
    })

    it('shows "Chưa đối soát" for needs_reconciliation receipts state', () => {
      const res = formatOwnerReceiptsDisplay({
        receipts: { state: 'needs_reconciliation', amount: null },
        currencyCode: 'VND',
      })
      expect(res.value).toBe('Chưa đối soát')
      expect(res.badgeVariant).toBe('cockpit-badge--warning')
    })
  })

  describe('computePageRetentionBreakdown (R04)', () => {
    it('separates warranty from other retention and labels as page-only', () => {
      const rows = [
        { retentionAmount: '10000000.0000', retentionKind: 'warranty' as const },
        { retentionAmount: '20000000.0000', retentionKind: 'other' as const },
        { retentionAmount: '5000000.0000', retentionKind: 'warranty' as const },
        { retentionAmount: null, retentionKind: null },
      ]
      const res = computePageRetentionBreakdown(rows, 'VND')
      expect(res.warranty).toEqual({
        amount: '15,000,000 VND',
        count: 2,
        label: 'Bảo hành trên trang này',
      })
      expect(res.other).toEqual({
        amount: '20,000,000 VND',
        count: 1,
        label: 'Khoản giữ lại khác trên trang này',
      })
    })

    it('handles warranty-only rows', () => {
      const rows = [{ retentionAmount: '50000000.0000', retentionKind: 'warranty' as const }]
      const res = computePageRetentionBreakdown(rows, 'VND')
      expect(res.warranty?.amount).toBe('50,000,000 VND')
      expect(res.other).toBeNull()
    })

    it('handles other-only rows', () => {
      const rows = [{ retentionAmount: '30000000.0000', retentionKind: 'other' as const }]
      const res = computePageRetentionBreakdown(rows, 'VND')
      expect(res.warranty).toBeNull()
      expect(res.other?.amount).toBe('30,000,000 VND')
    })

    it('returns nulls for empty or all-null rows', () => {
      expect(computePageRetentionBreakdown([])).toEqual({ warranty: null, other: null })
      expect(computePageRetentionBreakdown([{ retentionAmount: null, retentionKind: null }])).toEqual({
        warranty: null,
        other: null,
      })
    })
  })

  describe('computeProjectKpiCards (R06, Improvement B)', () => {
    it('produces all four typed KPI view models consistently', () => {
      const summary = {
        budget: { state: 'recorded', amount: '500000000.0000', recordedCount: 1 },
        cost: { state: 'recorded' as const, amount: '350000000.0000', knownSubtotal: '350000000.0000' },
        warrantyRetention: { state: 'recorded' as const, amount: '25000000.0000', recordedCount: 2 },
        management: {
          receipts: { state: 'recorded', amount: '400000000.0000', recordedCount: 2 },
          result: { state: 'provisional', amount: '25000000.0000', basis: 'owner_receipts' },
        },
      }
      const kpis = computeProjectKpiCards(summary, { currencyCode: 'VND', moneyScale: 0 })

      expect(kpis.provisionalProfit.value).toBe('25,000,000 VND')
      expect(kpis.receipts.value).toBe('400,000,000 VND')
      expect(kpis.receipts.budgetSecondaryText).toBe('Dự toán: 500,000,000 VND')
      expect(kpis.cost.value).toBe('350,000,000 VND')
      expect(kpis.warranty.value).toBe('25,000,000 VND')
    })
  })

  describe('formatProvisionalProfitDisplay named input support', () => {
    it('accepts named options object', () => {
      const res = formatProvisionalProfitDisplay({
        result: { state: 'provisional', amount: '100000000.0000', basis: 'owner_receipts' },
        costState: 'recorded',
        currencyCode: 'VND',
        moneyScale: 0,
      })
      expect(res.value).toBe('100,000,000 VND')
      expect(res.label).toBe('Lợi nhuận tạm tính')
    })
  })
})
