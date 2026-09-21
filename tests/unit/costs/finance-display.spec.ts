import { describe, expect, it } from 'vitest'
import {
  categoryDisplayName,
  formatCostDisplay,
  formatDateProvenance,
  formatFinanceMoney,
  formatManagementHeadline,
  formatMarginReasons,
  formatOperationalState,
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
      const res = formatProvisionalProfitDisplay(
        { state: 'provisional', amount: '350000000.0000', basis: 'owner_receipts' },
        'recorded',
        [],
        'VND',
      )
      expect(res.label).toBe('Lợi nhuận tạm tính')
      expect(res.value).toBe('350,000,000 VND')
      expect(res.isAvailable).toBe(true)
      expect(res.isNegative).toBe(false)
      expect(res.colorScheme).toBe('provisional')
      expect(res.caption).toBe('Theo số đã thu')
      expect(res.tooltipText).toContain('Lợi nhuận tạm tính = Thu từ CĐT - Chi phí ghi nhận - Bảo hành')
    })

    it('formats negative provisional profit with red danger styling', () => {
      const res = formatProvisionalProfitDisplay(
        { state: 'provisional', amount: '-30000000.0000', basis: 'owner_receipts' },
        'recorded',
        [],
        'VND',
      )
      expect(res.label).toBe('Lợi nhuận tạm tính')
      expect(res.value).toBe('-30,000,000 VND')
      expect(res.isAvailable).toBe(true)
      expect(res.isNegative).toBe(true)
      expect(res.colorScheme).toBe('danger')
    })

    it('includes partial cost caveat in tooltip when cost needs reconciliation', () => {
      const res = formatProvisionalProfitDisplay(
        { state: 'provisional', amount: '150000000.0000', basis: 'owner_receipts' },
        'needs_reconciliation',
        [],
        'VND',
      )
      expect(res.tooltipText).toContain('Chi phí chưa đối soát đầy đủ')
    })

    it('formats unavailable profit as "Chưa đủ dữ liệu" with reasons', () => {
      const res = formatProvisionalProfitDisplay(
        { state: 'unavailable', amount: null, reasons: ['COST_INCOMPLETE'] },
        'not_recorded',
        ['COST_INCOMPLETE'],
        'VND',
      )
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
      const res = formatCostDisplay({ state: 'recorded', amount: '120000000.0000' }, 'VND')
      expect(res.label).toBe('Chi phí')
      expect(res.value).toBe('120,000,000 VND')
      expect(res.knownSubtotal).toBeNull()
      expect(res.sublineLabel).toBeNull()
    })

    it('formats not_recorded state with "Chưa ghi nhận"', () => {
      const res = formatCostDisplay({ state: 'not_recorded', amount: null })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.sublineLabel).toBeNull()
    })

    it('formats not_recorded state with knownSubtotal of 0.0000 as "Chưa ghi nhận" without subline', () => {
      const res = formatCostDisplay({ state: 'not_recorded', amount: null, knownSubtotal: '0.0000' })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.knownSubtotal).toBeNull()
      expect(res.sublineLabel).toBeNull()
    })

    it('formats needs_reconciliation state with known amount and stateLabel without prefix', () => {
      const res = formatCostDisplay({ state: 'needs_reconciliation', amount: null, knownSubtotal: '50000000.0000' }, 'VND')
      expect(res.value).toBe('50,000,000 VND')
      expect(res.stateLabel).toBe('Chưa đối soát')
      expect(res.knownSubtotal).toBe('50,000,000 VND')
      expect(res.sublineLabel).toBe('50,000,000 VND')
    })
  })

  describe('formatWarrantyRetentionDisplay', () => {
    it('formats recorded warranty retention with amount, row count, and warranty badge', () => {
      const res = formatWarrantyRetentionDisplay({ state: 'recorded', amount: '15000000.0000', recordedCount: 2 }, 'VND')
      expect(res.label).toBe('Bảo hành đã ghi nhận')
      expect(res.value).toBe('15,000,000 VND')
      expect(res.countText).toBe('(2 khoản)')
      expect(res.badgeVariant).toBe('cockpit-badge--warranty')
    })

    it('formats not_recorded warranty retention with row count', () => {
      const res = formatWarrantyRetentionDisplay({ state: 'not_recorded', amount: null, recordedCount: 0 })
      expect(res.value).toBe('Chưa ghi nhận')
      expect(res.countText).toBe('(0 khoản)')
    })

    it('formats needs_reconciliation warranty retention with row count', () => {
      const res = formatWarrantyRetentionDisplay({ state: 'needs_reconciliation', amount: null, recordedCount: 1 })
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
})
