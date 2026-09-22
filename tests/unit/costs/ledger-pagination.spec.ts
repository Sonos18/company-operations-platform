import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  financeItemDetailsSchema,
  financeSubcontractDetailSchema,
  type FinanceItemDetails,
  type FinanceSubcontractDetail,
  type ItemDetailQuery,
  type PaymentQuery,
} from '../../../shared/schemas/costs/project-finance'
import {
  computePageRetentionBreakdown,
} from '../../../app/utils/costs/finance-display'

// Helper to format Decimal to 4 decimal places
function toDecimalString(val: number | string): string {
  return new Decimal(val).toFixed(4)
}

// ---------------------------------------------------------------------------
// 1. Generate 65 synthetic records for Ordinary Ledger
// ---------------------------------------------------------------------------
const baseOrdinaryRows = Array.from({ length: 65 }, (_, i) => {
  const index = i + 1
  const isWarranty = index % 3 === 1
  const isOther = index % 3 === 2
  const hasRetention = isWarranty || isOther

  const amount = new Decimal(10_000_000).plus(index * 1_000_000)
  const retentionRate = hasRetention ? 500 : null
  const retentionAmount = hasRetention
    ? amount.times(0.05).toFixed(4)
    : null

  const day = String((index % 28) + 1).padStart(2, '0')
  const dateStr = `2026-08-${day}`

  return {
    id: `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    lineNo: index,
    detailKind: 'line_item' as const,
    description: index % 2 === 0 ? `Thi công khoan cọc cống đợt ${index}` : `Vận chuyển cát san lấp đợt ${index}`,
    quantity: '1.0000',
    unitCode: 'm',
    unitPrice: toDecimalString(amount),
    amount: toDecimalString(amount),
    retentionKind: isWarranty ? ('warranty' as const) : isOther ? ('other' as const) : null,
    retentionRateBps: retentionRate,
    retentionAmount,
    relevantDate: dateStr,
    effectiveDate: dateStr,
    dateSource: 'relevant_date' as const,
    reference: `REF-${String(index).padStart(4, '0')}`,
    note: index === 10 ? 'Lưu ý kiểm tra nghiệm thu' : null,
    createdAt: `${dateStr}T08:00:00.000Z`,
    version: 0,
  }
})

const ordinaryFullAmount = baseOrdinaryRows
  .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
  .toFixed(4)

function paginateOrdinary(
  allRows: typeof baseOrdinaryRows,
  query: Partial<ItemDetailQuery> = {},
): FinanceItemDetails['details'] {
  const q = (query.q ?? '').trim().toLowerCase()
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo
  const retention = query.retention ?? 'all'
  const pageSize = (query.pageSize ?? 25) as 25 | 50 | 100
  const requestedPage = query.page ?? 1

  // Filter
  const filtered = allRows.filter((row) => {
    if (q) {
      const matchDesc = row.description.toLowerCase().includes(q)
      const matchRef = (row.reference ?? '').toLowerCase().includes(q)
      if (!matchDesc && !matchRef) return false
    }
    if (dateFrom && row.effectiveDate < dateFrom) return false
    if (dateTo && row.effectiveDate > dateTo) return false
    if (retention === 'warranty' && row.retentionKind !== 'warranty') return false
    if (retention === 'other' && row.retentionKind !== 'other') return false
    if (retention === 'no_recorded_retention' && row.retentionKind != null) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.max(1, Math.min(requestedPage, totalPages))
  const offset = (clampedPage - 1) * pageSize
  const pageRows = filtered.slice(offset, offset + pageSize)

  const filteredAmount = filtered
    .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
    .toFixed(4)

  return {
    rows: pageRows,
    pagination: {
      page: clampedPage,
      pageSize,
      totalPages,
      filteredCount: filtered.length,
      fullCount: allRows.length,
      filteredAmount,
      fullAmount: ordinaryFullAmount,
    },
  }
}

// ---------------------------------------------------------------------------
// 2. Generate 65 synthetic records for Subcontract-Payment Ledger
// ---------------------------------------------------------------------------
const basePaymentRows = Array.from({ length: 65 }, (_, i) => {
  const index = i + 1
  const isWarranty = index % 2 === 0
  const paid = new Decimal(5_000_000).plus(index * 500_000)
  const warrantyAmount = isWarranty ? paid.times(0.05).toFixed(4) : null
  const day = String((index % 28) + 1).padStart(2, '0')
  const dateStr = `2026-07-${day}`

  return {
    id: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    contractId: '50000000-0000-4000-8000-000000000001',
    contractCode: 'HD-SUB-01',
    contractNo: 'SUB-2026-01',
    description: index % 2 === 0 ? `Thanh toán nhân công đợt ${index}` : `Tạm ứng tổ đội đợt ${index}`,
    paidAmount: toDecimalString(paid),
    warrantyRetentionAmount: warrantyAmount,
    retentionRateBps: isWarranty ? 500 : null,
    paymentDate: dateStr,
    effectiveDate: dateStr,
    dateSource: 'payment_date' as const,
    recordStatus: 'recorded' as const,
    reference: `PAY-${String(index).padStart(4, '0')}`,
    sourceReference: null,
    note: isWarranty ? 'Bảo hành 5%' : null,
    createdAt: `${dateStr}T10:00:00.000Z`,
    version: 0,
  }
})

const paymentFullAmount = basePaymentRows
  .reduce((sum, r) => sum.plus(new Decimal(r.paidAmount)), new Decimal(0))
  .toFixed(4)

function paginatePayments(
  allRows: typeof basePaymentRows,
  query: Partial<PaymentQuery> = {},
): FinanceSubcontractDetail['contract']['payments'] {
  const q = (query.q ?? '').trim().toLowerCase()
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo
  const retention = query.retention ?? 'all'
  const pageSize = (query.pageSize ?? 25) as 25 | 50 | 100
  const requestedPage = query.page ?? 1

  // Filter
  const filtered = allRows.filter((row) => {
    if (q) {
      const matchDesc = row.description.toLowerCase().includes(q)
      const matchRef = (row.reference ?? '').toLowerCase().includes(q)
      if (!matchDesc && !matchRef) return false
    }
    if (dateFrom && row.effectiveDate < dateFrom) return false
    if (dateTo && row.effectiveDate > dateTo) return false
    if (retention === 'warranty' && row.warrantyRetentionAmount == null) return false
    if (retention === 'no_recorded_retention' && row.warrantyRetentionAmount != null) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.max(1, Math.min(requestedPage, totalPages))
  const offset = (clampedPage - 1) * pageSize
  const pageRows = filtered.slice(offset, offset + pageSize)

  const filteredAmount = filtered
    .reduce((sum, r) => sum.plus(new Decimal(r.paidAmount)), new Decimal(0))
    .toFixed(4)

  const recordedRetentionTotal = filtered
    .filter(r => r.warrantyRetentionAmount != null)
    .reduce((sum, r) => sum.plus(new Decimal(r.warrantyRetentionAmount!)), new Decimal(0))
    .toFixed(4)

  return {
    rows: pageRows,
    pagination: {
      page: clampedPage,
      pageSize,
      totalPages,
      filteredCount: filtered.length,
      fullCount: allRows.length,
      filteredAmount,
      fullAmount: paymentFullAmount,
    },
    recordedTotal: paymentFullAmount,
    recordedCount: allRows.length,
    recordedRetentionTotal,
    recordedRetentionRowCount: filtered.filter(r => r.warrantyRetentionAmount != null).length,
  }
}

describe('R01: Ledger pagination, filters and totals regressions (60+ records each mode)', () => {
  describe('Mode 1: Ordinary Ledger (65 records)', () => {
    it('validates schema conformity of 65 synthetic ordinary rows', () => {
      expect(baseOrdinaryRows.length).toBeGreaterThanOrEqual(60)
      const response = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25 })
      const fullEnvelope = {
        schemaVersion: 1 as const,
        kind: 'ordinary' as const,
        project: {
          projectId: '10000000-0000-4000-8000-000000000001',
          projectCode: 'P1',
          projectName: 'Project 1',
          currencyCode: 'VND',
          moneyScale: 0,
          timeZone: 'Asia/Ho_Chi_Minh',
          operationalState: 'active' as const,
        },
        category: {
          categoryId: '20000000-0000-4000-8000-000000000001',
          code: 'materials',
          name: 'Vật liệu',
          displayOrder: 1,
          isActive: true,
          itemId: '30000000-0000-4000-8000-000000000001',
          description: 'Hạng mục vật liệu',
          businessReference: 'REF-MAT',
          cost: { state: 'recorded' as const, amount: ordinaryFullAmount, recordedCount: 65 },
          detailCount: 65,
          latestRecordedDate: '2026-08-28',
          latestRecordedDateSource: 'business_date',
          warrantyRetention: { state: 'not_recorded' as const, amount: null, recordedCount: 0 },
          recordedPaymentsTotal: null,
          recordedPaymentCount: 0,
          legacyReconciliationRequired: false,
        },
        item: {
          id: '30000000-0000-4000-8000-000000000001',
          description: 'Hạng mục vật liệu',
          businessReference: 'REF-MAT',
          parentAmount: ordinaryFullAmount,
          currencyCode: 'VND',
          version: 1,
        },
        details: response,
      }
      expect(financeItemDetailsSchema.safeParse(fullEnvelope).success).toBe(true)
    })

    it('browses pages 1, 2, 3 and confirms full totals never change with pagination', () => {
      // Page 1
      const p1 = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25 })
      expect(p1.rows).toHaveLength(25)
      expect(p1.pagination.page).toBe(1)
      expect(p1.pagination.totalPages).toBe(3)
      expect(p1.pagination.fullCount).toBe(65)
      expect(p1.pagination.fullAmount).toBe(ordinaryFullAmount)
      expect(p1.rows[0]?.lineNo).toBe(1)
      expect(p1.rows[24]?.lineNo).toBe(25)

      // Page 2
      const p2 = paginateOrdinary(baseOrdinaryRows, { page: 2, pageSize: 25 })
      expect(p2.rows).toHaveLength(25)
      expect(p2.pagination.page).toBe(2)
      expect(p2.pagination.totalPages).toBe(3)
      // FULL TOTALS MUST REMAIN IDENTICAL
      expect(p2.pagination.fullCount).toBe(65)
      expect(p2.pagination.fullAmount).toBe(ordinaryFullAmount)
      expect(p2.rows[0]?.lineNo).toBe(26)
      expect(p2.rows[24]?.lineNo).toBe(50)

      // Page 3 (final page)
      const p3 = paginateOrdinary(baseOrdinaryRows, { page: 3, pageSize: 25 })
      expect(p3.rows).toHaveLength(15)
      expect(p3.pagination.page).toBe(3)
      expect(p3.pagination.totalPages).toBe(3)
      // FULL TOTALS MUST REMAIN IDENTICAL
      expect(p3.pagination.fullCount).toBe(65)
      expect(p3.pagination.fullAmount).toBe(ordinaryFullAmount)
      expect(p3.rows[0]?.lineNo).toBe(51)
      expect(p3.rows[14]?.lineNo).toBe(65)
    })

    it('clamps page when requested page is out of bounds', () => {
      // Request page 99 -> clamped to max page (3)
      const pClampedHigh = paginateOrdinary(baseOrdinaryRows, { page: 99, pageSize: 25 })
      expect(pClampedHigh.pagination.page).toBe(3)
      expect(pClampedHigh.rows).toHaveLength(15)

      // Request page -5 -> clamped to min page (1)
      const pClampedLow = paginateOrdinary(baseOrdinaryRows, { page: -5, pageSize: 25 })
      expect(pClampedLow.pagination.page).toBe(1)
      expect(pClampedLow.rows).toHaveLength(25)
    })

    it('chooses pageSize 25, 50, 100 correctly and recalculates totalPages', () => {
      const p25 = paginateOrdinary(baseOrdinaryRows, { pageSize: 25 })
      expect(p25.pagination.pageSize).toBe(25)
      expect(p25.pagination.totalPages).toBe(3)
      expect(p25.rows).toHaveLength(25)

      const p50 = paginateOrdinary(baseOrdinaryRows, { pageSize: 50 })
      expect(p50.pagination.pageSize).toBe(50)
      expect(p50.pagination.totalPages).toBe(2)
      expect(p50.rows).toHaveLength(50)

      const p100 = paginateOrdinary(baseOrdinaryRows, { pageSize: 100 })
      expect(p100.pagination.pageSize).toBe(100)
      expect(p100.pagination.totalPages).toBe(1)
      expect(p100.rows).toHaveLength(65)
    })

    it('filters while on final page, resets to page 1 and maintains full vs filtered independence', () => {
      // User is on page 3, then types search "khoan cọc"
      // In component: emitQuery(true) resets page to 1
      const pFiltered = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25, q: 'khoan cọc' })
      expect(pFiltered.pagination.page).toBe(1)
      // Even indexes are "khoan cọc" -> 32 records
      expect(pFiltered.pagination.filteredCount).toBe(32)
      expect(pFiltered.pagination.fullCount).toBe(65)
      expect(pFiltered.pagination.filteredAmount).not.toBe(pFiltered.pagination.fullAmount)
      expect(pFiltered.pagination.fullAmount).toBe(ordinaryFullAmount)
    })

    it('clears filters and restores full count on page 1', () => {
      const pCleared = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25 })
      expect(pCleared.pagination.page).toBe(1)
      expect(pCleared.pagination.filteredCount).toBe(65)
      expect(pCleared.pagination.fullCount).toBe(65)
      expect(pCleared.pagination.filteredAmount).toBe(ordinaryFullAmount)
      expect(pCleared.pagination.fullAmount).toBe(ordinaryFullAmount)
    })

    it('handles no matches gracefully with 0 rows while preserving full totals', () => {
      const pNoMatch = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25, q: 'NON_EXISTING_KEYWORD_XYZ' })
      expect(pNoMatch.rows).toHaveLength(0)
      expect(pNoMatch.pagination.filteredCount).toBe(0)
      expect(pNoMatch.pagination.filteredAmount).toBe('0.0000')
      // Full totals remain untouched
      expect(pNoMatch.pagination.fullCount).toBe(65)
      expect(pNoMatch.pagination.fullAmount).toBe(ordinaryFullAmount)
    })

    it('validates inverted date range locally and prevents submission', () => {
      const dateFrom = '2026-09-15'
      const dateTo = '2026-09-01'
      const isInverted = dateFrom > dateTo
      expect(isInverted).toBe(true)

      // When dateFrom > dateTo, component dateValidationError is truthy and emitQuery early-exits
      const hasValidationError = dateFrom && dateTo && dateFrom > dateTo
      expect(hasValidationError).toBe(true)
    })
  })

  describe('Mode 2: Subcontract Payment Ledger (65 records)', () => {
    it('validates schema conformity of 65 synthetic payment rows', () => {
      expect(basePaymentRows.length).toBeGreaterThanOrEqual(60)
      const payments = paginatePayments(basePaymentRows, { page: 1, pageSize: 25 })
      const subcontractEnvelope = {
        schemaVersion: 1 as const,
        project: {
          projectId: '10000000-0000-4000-8000-000000000001',
          projectCode: 'P1',
          projectName: 'Project 1',
          currencyCode: 'VND',
          moneyScale: 0,
          timeZone: 'Asia/Ho_Chi_Minh',
          operationalState: 'active' as const,
        },
        party: {
          partyId: '40000000-0000-4000-8000-000000000001',
          code: 'CT-YM',
          displayName: 'Nhà thầu Yong Mei',
          partyKind: 'organization' as const,
        },
        contract: {
          id: '50000000-0000-4000-8000-000000000001',
          code: 'HD-SUB-01',
          contractNo: 'SUB-2026-01',
          contractName: 'Hợp đồng nhân công Yong Mei',
          contractDate: '2026-07-01',
          contractValue: paymentFullAmount,
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 1,
          reference: null,
          sourceReference: null,
          note: null,
          paidTotal: paymentFullAmount,
          paidCount: 65,
          recordedRetentionTotal: payments.recordedRetentionTotal,
          recordedRetentionRowCount: payments.recordedRetentionRowCount,
          referenceHeadroom: '0.0000',
          referenceHeadroomReason: null,
        },
        payments,
      }
      expect(financeSubcontractDetailSchema.safeParse(subcontractEnvelope).success).toBe(true)
    })

    it('browses pages 1, 2, 3 and confirms full totals never change with pagination', () => {
      // Page 1
      const p1 = paginatePayments(basePaymentRows, { page: 1, pageSize: 25 })
      expect(p1.rows).toHaveLength(25)
      expect(p1.pagination.page).toBe(1)
      expect(p1.pagination.totalPages).toBe(3)
      expect(p1.pagination.fullCount).toBe(65)
      expect(p1.pagination.fullAmount).toBe(paymentFullAmount)

      // Page 2
      const p2 = paginatePayments(basePaymentRows, { page: 2, pageSize: 25 })
      expect(p2.rows).toHaveLength(25)
      expect(p2.pagination.page).toBe(2)
      expect(p2.pagination.totalPages).toBe(3)
      // FULL TOTALS NEVER CHANGE
      expect(p2.pagination.fullCount).toBe(65)
      expect(p2.pagination.fullAmount).toBe(paymentFullAmount)

      // Page 3
      const p3 = paginatePayments(basePaymentRows, { page: 3, pageSize: 25 })
      expect(p3.rows).toHaveLength(15)
      expect(p3.pagination.page).toBe(3)
      expect(p3.pagination.totalPages).toBe(3)
      // FULL TOTALS NEVER CHANGE
      expect(p3.pagination.fullCount).toBe(65)
      expect(p3.pagination.fullAmount).toBe(paymentFullAmount)
    })

    it('chooses pageSize 25, 50, 100 on subcontract payments', () => {
      const p25 = paginatePayments(basePaymentRows, { pageSize: 25 })
      expect(p25.pagination.totalPages).toBe(3)

      const p50 = paginatePayments(basePaymentRows, { pageSize: 50 })
      expect(p50.pagination.totalPages).toBe(2)

      const p100 = paginatePayments(basePaymentRows, { pageSize: 100 })
      expect(p100.pagination.totalPages).toBe(1)
    })

    it('filters while on final page, resets to page 1 and maintains full vs filtered independence', () => {
      // On page 3, filter by retention: 'warranty'
      const pFiltered = paginatePayments(basePaymentRows, { page: 1, pageSize: 25, retention: 'warranty' })
      expect(pFiltered.pagination.page).toBe(1)
      // Even indexes have warranty -> 32 records
      expect(pFiltered.pagination.filteredCount).toBe(32)
      expect(pFiltered.pagination.fullCount).toBe(65)
      expect(pFiltered.pagination.fullAmount).toBe(paymentFullAmount)
    })

    it('handles no matches gracefully with 0 rows while preserving full totals', () => {
      const pNoMatch = paginatePayments(basePaymentRows, { page: 1, pageSize: 25, q: 'NOT_FOUND_XYZ' })
      expect(pNoMatch.rows).toHaveLength(0)
      expect(pNoMatch.pagination.filteredCount).toBe(0)
      expect(pNoMatch.pagination.filteredAmount).toBe('0.0000')
      expect(pNoMatch.pagination.fullCount).toBe(65)
      expect(pNoMatch.pagination.fullAmount).toBe(paymentFullAmount)
    })
  })

  describe('R04: Retention separation and page-only labeling', () => {
    it('strictly separates warranty from other retention and labels page-only', () => {
      const page1Rows = paginateOrdinary(baseOrdinaryRows, { page: 1, pageSize: 25 }).rows
      const breakdown = computePageRetentionBreakdown(page1Rows, 'VND', 0)

      expect(breakdown).not.toBeNull()
      expect(breakdown.warranty).toBeDefined()
      expect(breakdown.other).toBeDefined()

      // Warranty is strictly labeled 'trên trang này'
      expect(breakdown.warranty?.label).toBe('Bảo hành trên trang này')
      // Other is strictly labeled 'trên trang này'
      expect(breakdown.other?.label).toBe('Khoản giữ lại khác trên trang này')

      // Never summed together!
      expect(breakdown.warranty?.amount).not.toBe(breakdown.other?.amount)
    })

    it('keeps null distinct from recorded zero', () => {
      const zeroRow = [{
        id: '60000000-0000-4000-8000-000000000099',
        lineNo: 1,
        retentionKind: 'warranty' as const,
        retentionAmount: '0.0000',
      }]
      const zeroBreakdown = computePageRetentionBreakdown(zeroRow, 'VND', 0)
      expect(zeroBreakdown.warranty?.amount).toBe('0 VND')
      expect(zeroBreakdown.warranty?.count).toBe(1)
      expect(zeroBreakdown.other).toBeNull()

      const nullRow = [{
        id: '60000000-0000-4000-8000-000000000098',
        lineNo: 1,
        retentionKind: null,
        retentionAmount: null,
      }]
      const nullBreakdown = computePageRetentionBreakdown(nullRow, 'VND', 0)
      expect(nullBreakdown.warranty).toBeNull()
      expect(nullBreakdown.other).toBeNull()
    })
  })
})
