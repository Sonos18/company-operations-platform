import Decimal from 'decimal.js'
import type { FinanceCategoryRow } from '../../../shared/schemas/costs/project-finance'
import { categoryDisplayName, formatFinanceMoney } from './finance-display'

export interface CategoryChartItem {
  categoryId: string
  code: string
  name: string
  displayName: string
  hasAmount: boolean
  rawAmount: string | null
  decimalAmount: Decimal
  quality: 'solid' | 'unreconciled_disbursement' | 'none'
  color: string
  stateText: string
  isUnreconciledSubcontract: boolean
  isExactZero: boolean
}

export const CATEGORY_ACCENT_COLORS: Record<string, string> = {
  materials: '#2563eb', // blue
  machinery: '#d97706', // amber/orange
  direct_labor: '#0d9488', // teal
  subcontract_labor: '#7c3aed', // violet
  other: '#64748b', // neutral/slate
}

export function getCategoryAccentColor(code: string): string {
  return CATEGORY_ACCENT_COLORS[code] ?? CATEGORY_ACCENT_COLORS.other ?? '#64748b'
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatCategoryAxisLabel(name: string): string {
  if (!name) return ''
  if (name === 'Nhân công trực tiếp') return 'Nhân công\ntrực tiếp'
  if (name === 'Nhân công khoán') return 'Nhân công\nkhoán'
  if (name === 'Nhân công thầu phụ') return 'Nhân công\nthầu phụ'
  if (name === 'Chi phí khác') return 'Chi phí\nkhác'
  if (name === 'Máy thi công') return 'Máy thi\ncông'
  if (name.length > 12 && name.includes(' ')) {
    const parts = name.split(' ')
    if (parts.length === 2) {
      return `${parts[0]}\n${parts[1]}`
    }
    const mid = Math.ceil(parts.length / 2)
    return `${parts.slice(0, mid).join(' ')}\n${parts.slice(mid).join(' ')}`
  }
  return name
}

export function getYAxisConfig(currencyCode = 'VND', maxAmount = 0): {
  name: string
  formatter: (val: number) => string
} {
  const isVnd = currencyCode.toUpperCase() === 'VND'

  if (isVnd) {
    if (maxAmount >= 1_000_000) {
      return {
        name: 'Triệu VND',
        formatter: (val: number) => {
          if (val === 0) return '0'
          const inMillions = val / 1_000_000
          return inMillions.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
        },
      }
    }
    return {
      name: 'VND',
      formatter: (val: number) => {
        if (val === 0) return '0'
        return val.toLocaleString('vi-VN')
      },
    }
  }

  // Other currencies (e.g. USD)
  if (maxAmount >= 1_000_000_000) {
    return {
      name: currencyCode,
      formatter: (val: number) => {
        if (val === 0) return '0'
        return `${(val / 1e9).toFixed(1)}B`
      },
    }
  }
  if (maxAmount >= 1_000_000) {
    return {
      name: currencyCode,
      formatter: (val: number) => {
        if (val === 0) return '0'
        return `${(val / 1e6).toFixed(1)}M`
      },
    }
  }
  if (maxAmount >= 1_000) {
    return {
      name: currencyCode,
      formatter: (val: number) => {
        if (val === 0) return '0'
        return `${(val / 1e3).toFixed(0)}K`
      },
    }
  }

  return {
    name: currencyCode,
    formatter: (val: number) => String(val),
  }
}

export interface PreparedCategoryData {
  visibleItems: CategoryChartItem[]
  chartItems: CategoryChartItem[]
  allItems: CategoryChartItem[]
  hiddenZeroCount: number
  missingDataCount: number
  allAreExactZero: boolean
  allAreUnavailable: boolean
  hasUnreconciledData: boolean
  hasNegativeAmount: boolean
}

export function prepareCategoryChartData(categories: FinanceCategoryRow[]): PreparedCategoryData {
  let exactZeroCount = 0
  let missingCount = 0

  const processed: CategoryChartItem[] = categories.map((cat) => {
    const displayName = categoryDisplayName(cat.code, cat.name)
    const color = getCategoryAccentColor(cat.code)

    if (cat.cost.state === 'recorded' && cat.cost.amount != null) {
      const dec = new Decimal(cat.cost.amount)
      if (dec.isZero()) {
        exactZeroCount++
        return {
          categoryId: cat.categoryId,
          code: cat.code,
          name: cat.name,
          displayName,
          hasAmount: true,
          rawAmount: cat.cost.amount,
          decimalAmount: dec,
          quality: 'solid' as const,
          color,
          stateText: 'Đã ghi nhận',
          isUnreconciledSubcontract: false,
          isExactZero: true,
        }
      }
      return {
        categoryId: cat.categoryId,
        code: cat.code,
        name: cat.name,
        displayName,
        hasAmount: true,
        rawAmount: cat.cost.amount,
        decimalAmount: dec,
        quality: 'solid' as const,
        color,
        stateText: 'Đã ghi nhận',
        isUnreconciledSubcontract: false,
        isExactZero: false,
      }
    }

    if (
      cat.code === 'subcontract_labor' &&
      cat.cost.state === 'needs_reconciliation' &&
      cat.recordedPaymentCount > 0 &&
      cat.recordedPaymentsTotal != null
    ) {
      const dec = new Decimal(cat.recordedPaymentsTotal)
      if (dec.isZero()) {
        exactZeroCount++
        return {
          categoryId: cat.categoryId,
          code: cat.code,
          name: cat.name,
          displayName,
          hasAmount: true,
          rawAmount: cat.recordedPaymentsTotal,
          decimalAmount: dec,
          quality: 'unreconciled_disbursement' as const,
          color,
          stateText: 'Chi/ứng khoán đã ghi nhận · Chưa đối soát',
          isUnreconciledSubcontract: true,
          isExactZero: true,
        }
      }
      return {
        categoryId: cat.categoryId,
        code: cat.code,
        name: cat.name,
        displayName,
        hasAmount: true,
        rawAmount: cat.recordedPaymentsTotal,
        decimalAmount: dec,
        quality: 'unreconciled_disbursement' as const,
        color,
        stateText: 'Chi/ứng khoán đã ghi nhận · Chưa đối soát',
        isUnreconciledSubcontract: true,
        isExactZero: false,
      }
    }

    missingCount++
    return {
      categoryId: cat.categoryId,
      code: cat.code,
      name: cat.name,
      displayName,
      hasAmount: false,
      rawAmount: null,
      decimalAmount: new Decimal(0),
      quality: 'none' as const,
      color,
      stateText: cat.cost.state === 'needs_reconciliation' ? 'Chưa đối soát' : 'Chưa ghi nhận',
      isUnreconciledSubcontract: false,
      isExactZero: false,
    }
  })

  // Visible items must have a usable non-zero amount
  const nonZeroItems = processed.filter(item => !item.isExactZero)
  const visibleItems = nonZeroItems.filter(item => item.hasAmount)

  visibleItems.sort((a, b) => {
    const cmp = b.decimalAmount.comparedTo(a.decimalAmount)
    if (cmp !== 0) return cmp
    return a.categoryId.localeCompare(b.categoryId)
  })

  const allAreExactZero = categories.length > 0 && exactZeroCount === categories.length
  const allAreUnavailable = categories.length > 0 && visibleItems.length === 0 && exactZeroCount === 0
  const hasUnreconciledData = visibleItems.some(item => item.isUnreconciledSubcontract)
  const hasNegativeAmount = visibleItems.some(item => item.decimalAmount.isNegative())

  return {
    visibleItems,
    chartItems: visibleItems,
    allItems: visibleItems, // Table only shows visible monetary rows (zero and missing omitted)
    hiddenZeroCount: exactZeroCount,
    missingDataCount: missingCount,
    allAreExactZero,
    allAreUnavailable,
    hasUnreconciledData,
    hasNegativeAmount,
  }
}

export function getDonutChartOption(
  items: CategoryChartItem[],
  currencyCode = 'VND',
  moneyScale = 0,
): Record<string, unknown> {
  const hasUnreconciled = items.some(i => i.isUnreconciledSubcontract)

  return {
    animation: false,
    aria: {
      enabled: true,
      decal: { show: true },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: {
        color: '#0f172a',
      },
      formatter: (params: unknown) => {
        const p = params as { data?: { name?: string; rawAmount?: string | null; stateText?: string }; percent?: number } | undefined
        const data = p?.data
        if (!data) return ''
        const safeName = escapeHtml(data.name)
        const safeAmount = escapeHtml(
          formatFinanceMoney(data.rawAmount, currencyCode, moneyScale) ?? '0',
        )
        const safeState = escapeHtml(data.stateText)
        const percent = p?.percent != null ? `${p.percent}%` : ''
        const percentNote = hasUnreconciled
          ? `<div style="font-size: 11px; color: #7c3aed; margin-top: 4px;">* Tỷ trọng trên số liệu hiển thị: ${percent}</div>`
          : `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">Tỷ trọng: ${percent}</div>`

        return `<div style="font-family: var(--font-sans, system-ui); font-size: 13px; line-height: 1.5;">
          <div style="font-weight: 600; color: #334155; margin-bottom: 2px;">${safeName}</div>
          <div style="font-family: var(--font-mono, monospace); font-weight: 700; font-size: 14px; color: #0f172a;">${safeAmount}</div>
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 2px;">${safeState}</div>
          ${percentNote}
        </div>`
      },
    },
    legend: {
      orient: 'horizontal',
      bottom: 4,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 12,
      padding: [0, 8],
      textStyle: {
        fontFamily: 'var(--font-sans, system-ui)',
        fontSize: 11,
        color: '#475569',
      },
    },
    series: [
      {
        name: 'Tỷ trọng số liệu hiển thị',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-sans, system-ui)',
            formatter: '{b}',
          },
        },
        data: items.map((item) => {
          const isHatched = item.quality === 'unreconciled_disbursement'
          return {
            value: item.decimalAmount.toNumber(),
            name: item.displayName,
            categoryId: item.categoryId,
            rawAmount: item.rawAmount,
            quality: item.quality,
            stateText: item.stateText,
            isUnreconciledSubcontract: item.isUnreconciledSubcontract,
            itemStyle: {
              color: isHatched ? 'rgba(124, 58, 237, 0.25)' : item.color,
              borderColor: item.color,
              borderWidth: isHatched ? 2 : 1,
              borderType: isHatched ? 'dashed' : 'solid',
            },
          }
        }),
      },
    ],
  }
}
