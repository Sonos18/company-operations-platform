import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ACCENT_COLORS,
  escapeHtml,
  formatCategoryAxisLabel,
  getCategoryAccentColor,
  getDonutChartOption,
  getYAxisConfig,
  prepareCategoryChartData,
} from '../../../app/utils/costs/category-chart'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'

describe('category-chart utility', () => {
  it('maps category codes to the approved color accents', () => {
    expect(getCategoryAccentColor('materials')).toBe('#2563eb') // blue
    expect(getCategoryAccentColor('machinery')).toBe('#d97706') // amber/orange
    expect(getCategoryAccentColor('direct_labor')).toBe('#0d9488') // teal
    expect(getCategoryAccentColor('subcontract_labor')).toBe('#7c3aed') // violet
    expect(getCategoryAccentColor('other')).toBe('#64748b') // neutral/slate
    expect(getCategoryAccentColor('unknown_custom')).toBe('#64748b') // fallback
  })

  it('escapes HTML strings safely for chart tooltips', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#039;s')
    expect(escapeHtml(null)).toBe('')
  })

  it('sorts chart items descending by exact Decimal amount and breaks ties stably with categoryId', () => {
    const cat1: FinanceCategoryRow = {
      categoryId: '11111111-1111-4111-8111-111111111111',
      code: 'materials',
      name: 'Vật liệu',
      displayOrder: 1,
      isActive: true,
      itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '50000000.0000', recordedCount: 2 },
      detailCount: 2,
      latestRecordedDate: '2026-09-01',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const cat2: FinanceCategoryRow = {
      categoryId: '22222222-2222-4222-8222-222222222222',
      code: 'machinery',
      name: 'Máy thi công',
      displayOrder: 2,
      isActive: true,
      itemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '120000000.0000', recordedCount: 3 },
      detailCount: 3,
      latestRecordedDate: '2026-09-02',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const cat3: FinanceCategoryRow = {
      categoryId: '33333333-3333-4333-8333-333333333333',
      code: 'direct_labor',
      name: 'Nhân công trực tiếp',
      displayOrder: 3,
      isActive: true,
      itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '50000000.0000', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: '2026-09-03',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const { chartItems } = prepareCategoryChartData([cat1, cat2, cat3])
    expect(chartItems).toHaveLength(3)
    // cat2 (120M) must be first
    expect(chartItems[0]!.categoryId).toBe(cat2.categoryId)
    expect(chartItems[0]!.rawAmount).toBe('120000000.0000')

    // cat1 and cat3 both have 50M -> tie broken by categoryId ('111...' < '333...')
    expect(chartItems[1]!.categoryId).toBe(cat1.categoryId)
    expect(chartItems[2]!.categoryId).toBe(cat3.categoryId)
  })

  it('renders unreconciled subcontract labor as a distinct disbursement bar with recorded payments total', () => {
    const catSub: FinanceCategoryRow = {
      categoryId: '44444444-4444-4444-8444-444444444444',
      code: 'subcontract_labor',
      name: 'Nhân công thầu phụ',
      displayOrder: 4,
      isActive: true,
      itemId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      description: null,
      businessReference: null,
      cost: { state: 'needs_reconciliation', amount: null, recordedCount: 0 },
      detailCount: 0,
      latestRecordedDate: '2026-09-04',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'recorded', amount: '5376500.0000', recordedCount: 1 },
      recordedPaymentsTotal: '102153500.0000',
      recordedPaymentCount: 4,
      legacyReconciliationRequired: true,
    }

    const { chartItems, allItems } = prepareCategoryChartData([catSub])
    expect(chartItems).toHaveLength(1)
    const item = chartItems[0]!
    expect(item.categoryId).toBe(catSub.categoryId)
    expect(item.rawAmount).toBe('102153500.0000')
    expect(item.quality).toBe('unreconciled_disbursement')
    expect(item.isUnreconciledSubcontract).toBe(true)
    expect(item.stateText).toContain('Chưa đối soát')

    expect(allItems).toHaveLength(1)
  })

  it('excludes exact zero categories from both chart and table while preserving small positive amounts and unavailable states', () => {
    const catZero: FinanceCategoryRow = {
      categoryId: '55555555-5555-4555-8555-555555555555',
      code: 'other',
      name: 'Chi phí khác',
      displayOrder: 5,
      isActive: true,
      itemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '0.0000', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: '2026-09-05',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const catSmallPositive: FinanceCategoryRow = {
      categoryId: '77777777-7777-4777-8777-777777777777',
      code: 'machinery',
      name: 'Máy móc',
      displayOrder: 7,
      isActive: true,
      itemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '0.0001', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: '2026-09-06',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const catEmpty: FinanceCategoryRow = {
      categoryId: '66666666-6666-4666-8666-666666666666',
      code: 'materials',
      name: 'Vật liệu',
      displayOrder: 6,
      isActive: true,
      itemId: null,
      description: null,
      businessReference: null,
      cost: { state: 'not_recorded', amount: null, recordedCount: 0 },
      detailCount: 0,
      latestRecordedDate: null,
      latestRecordedDateSource: null,
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const { chartItems, allItems, allAreExactZero, hiddenZeroCount, missingDataCount } = prepareCategoryChartData([
      catZero,
      catSmallPositive,
      catEmpty,
    ])

    // catZero is excluded from both chart and table
    expect(hiddenZeroCount).toBe(1)
    expect(allAreExactZero).toBe(false)
    expect(chartItems.find(i => i.categoryId === catZero.categoryId)).toBeUndefined()
    expect(allItems.find(i => i.categoryId === catZero.categoryId)).toBeUndefined()

    // catSmallPositive (0.0001) is preserved in both
    expect(chartItems.find(i => i.categoryId === catSmallPositive.categoryId)).toBeDefined()
    expect(allItems.find(i => i.categoryId === catSmallPositive.categoryId)).toBeDefined()

    // catEmpty is omitted from both chart and table, counted in missingDataCount
    expect(chartItems.find(i => i.categoryId === catEmpty.categoryId)).toBeUndefined()
    expect(allItems.find(i => i.categoryId === catEmpty.categoryId)).toBeUndefined()
    expect(missingDataCount).toBe(1)
  })

  it('flags allAreExactZero when all categories are recorded zero', () => {
    const catZero1: FinanceCategoryRow = {
      categoryId: '55555555-5555-4555-8555-555555555551',
      code: 'other',
      name: 'Chi phí khác',
      displayOrder: 1,
      isActive: true,
      itemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '0', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: null,
      latestRecordedDateSource: null,
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const catZero2: FinanceCategoryRow = {
      categoryId: '55555555-5555-4555-8555-555555555552',
      code: 'materials',
      name: 'Vật liệu',
      displayOrder: 2,
      isActive: true,
      itemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '0.00', recordedCount: 1 },
      detailCount: 1,
      latestRecordedDate: null,
      latestRecordedDateSource: null,
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const { chartItems, allItems, allAreExactZero, hiddenZeroCount } = prepareCategoryChartData([
      catZero1,
      catZero2,
    ])

    expect(allAreExactZero).toBe(true)
    expect(hiddenZeroCount).toBe(2)
    expect(chartItems).toHaveLength(0)
    expect(allItems).toHaveLength(0)
  })

  it('wraps long Vietnamese category labels onto two lines', () => {
    expect(formatCategoryAxisLabel('Nhân công trực tiếp')).toBe('Nhân công\ntrực tiếp')
    expect(formatCategoryAxisLabel('Nhân công khoán')).toBe('Nhân công\nkhoán')
    expect(formatCategoryAxisLabel('Nhân công thầu phụ')).toBe('Nhân công\nthầu phụ')
    expect(formatCategoryAxisLabel('Máy thi công')).toBe('Máy thi\ncông')
    expect(formatCategoryAxisLabel('Chi phí khác')).toBe('Chi phí\nkhác')
    expect(formatCategoryAxisLabel('Vật liệu')).toBe('Vật liệu')
  })

  it('derives Vietnamese-friendly Y-axis scale and units from currency and max amount', () => {
    // VND >= 1M -> Triệu VND
    const vndConfig = getYAxisConfig('VND', 120_000_000)
    expect(vndConfig.name).toBe('Triệu VND')
    expect(vndConfig.formatter(120_000_000)).toBe('120')
    expect(vndConfig.formatter(0)).toBe('0')

    // USD >= 1B -> B
    const usdConfig = getYAxisConfig('USD', 5_641_725_896)
    expect(usdConfig.name).toBe('USD')
    expect(usdConfig.formatter(5_000_000_000)).toBe('5.0B')
    expect(usdConfig.formatter(0)).toBe('0')
  })

  it('builds donut chart option with correct structure, styling and category colors', () => {
    const cat1: FinanceCategoryRow = {
      categoryId: '11111111-1111-4111-8111-111111111111',
      code: 'materials',
      name: 'Vật liệu',
      displayOrder: 1,
      isActive: true,
      itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      description: null,
      businessReference: null,
      cost: { state: 'recorded', amount: '60000000', recordedCount: 5 },
      detailCount: 5,
      latestRecordedDate: '2026-03-01',
      latestRecordedDateSource: 'invoice',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    }

    const cat2: FinanceCategoryRow = {
      categoryId: '22222222-2222-4222-8222-222222222222',
      code: 'subcontract_labor',
      name: 'Nhân công thầu phụ',
      displayOrder: 2,
      isActive: true,
      itemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      description: null,
      businessReference: null,
      cost: { state: 'needs_reconciliation', amount: null, recordedCount: 0 },
      detailCount: 0,
      latestRecordedDate: '2026-03-05',
      latestRecordedDateSource: 'payment',
      warrantyRetention: { state: 'not_recorded', amount: null, recordedCount: 0 },
      recordedPaymentsTotal: '40000000',
      recordedPaymentCount: 2,
      legacyReconciliationRequired: true,
    }

    interface DonutDataItem {
      categoryId: string
      value: number
      itemStyle: { color?: string; borderColor?: string; borderType?: string }
      isUnreconciledSubcontract?: boolean
    }
    interface DonutSeries {
      type: string
      radius: string[]
      data: DonutDataItem[]
    }
    interface DonutOption {
      series: DonutSeries[]
    }

    const { visibleItems } = prepareCategoryChartData([cat1, cat2])
    const option = getDonutChartOption(visibleItems, 'VND', 0) as unknown as DonutOption

    expect(option.series).toBeDefined()
    expect(option.series[0].type).toBe('pie')
    expect(option.series[0].radius).toEqual(['45%', '70%'])
    expect(option.series[0].data).toHaveLength(2)

    // materials item
    const matData = option.series[0].data.find(d => d.categoryId === cat1.categoryId)
    expect(matData).toBeDefined()
    expect(matData?.value).toBe(60000000)
    expect(matData?.itemStyle.color).toBe(CATEGORY_ACCENT_COLORS.materials)
    expect(matData?.itemStyle.borderType).toBe('solid')

    // subcontract item (unreconciled) has dashed border and distinct fill
    const subData = option.series[0].data.find(d => d.categoryId === cat2.categoryId)
    expect(subData).toBeDefined()
    expect(subData?.value).toBe(40000000)
    expect(subData?.itemStyle.borderColor).toBe(CATEGORY_ACCENT_COLORS.subcontract_labor)
    expect(subData?.itemStyle.borderType).toBe('dashed')
    expect(subData?.isUnreconciledSubcontract).toBe(true)
  })
})
