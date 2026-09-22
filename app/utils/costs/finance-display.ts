import Decimal from 'decimal.js'

export function formatFinanceMoney(
  value: string | number | null | undefined,
  currencyCode?: string,
  moneyScale = 0,
): string | null {
  if (value == null) return null
  const str = typeof value === 'number' ? String(value) : value
  const trimmed = str.trim()
  if (!trimmed) return null
  const isNegative = trimmed.startsWith('-')
  const absValue = isNegative ? trimmed.slice(1) : trimmed
  const [integerPart = '0', decimalPart = ''] = absValue.split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  let formattedDecimal = ''
  if (moneyScale > 0) {
    const padded = decimalPart.padEnd(moneyScale, '0').slice(0, moneyScale)
    const trimmedDecimal = padded.replace(/0+$/, '')
    if (trimmedDecimal.length > 0) {
      formattedDecimal = `.${trimmedDecimal}`
    }
  }
  else if (decimalPart) {
    const trimmedDecimal = decimalPart.replace(/0+$/, '')
    if (trimmedDecimal.length > 0) {
      formattedDecimal = `.${trimmedDecimal}`
    }
  }

  const result = `${isNegative ? '-' : ''}${formattedInteger}${formattedDecimal}`
  return currencyCode ? `${result} ${currencyCode}` : result
}

export function formatDateProvenance(
  date: string | null | undefined,
  source: 'business_date' | 'created_at' | 'relevant_date' | 'payment_date' | 'received_date' | null | undefined,
): { dateText: string; isSystemFallback: boolean; badgeLabel?: string } {
  if (!date) return { dateText: '—', isSystemFallback: false }
  const [year, month, day] = date.split('-')
  const formatted = year && month && day ? `${day}/${month}/${year}` : date
  if (source === 'created_at') {
    return {
      dateText: formatted,
      isSystemFallback: true,
      badgeLabel: 'Ngày nhập hệ thống',
    }
  }
  return {
    dateText: formatted,
    isSystemFallback: false,
  }
}

export const MARGIN_REASON_LABELS: Record<string, string> = {
  NO_APPROVED_BUDGET: 'Chưa có dự toán được duyệt',
  NO_REFERENCE: 'Chưa có dự toán hoặc khoản thu',
  COST_INCOMPLETE: 'Dữ liệu chi phí chưa đầy đủ',
  RETENTION_INCOMPLETE: 'Dữ liệu bảo hành chưa đầy đủ',
  BUDGET_BASIS_UNCONFIRMED: 'Cơ sở dự toán chưa xác nhận',
}

export function formatMarginReasons(reasons: string[] | null | undefined): string {
  if (!reasons || reasons.length === 0) return 'Chưa có thông tin dự toán và chi phí'
  return reasons.map(r => MARGIN_REASON_LABELS[r] ?? r).join(' · ')
}

export function formatRetentionCount(count: number): string {
  return `${count} khoản`
}

export function formatOperationalState(
  state: 'active' | 'completed' | 'paused' | 'unknown' | string | null | undefined,
): { label: string; badgeVariant: string } {
  switch (state) {
    case 'completed':
      return { label: 'Hoàn thành', badgeVariant: 'cockpit-badge--success' }
    case 'active':
      return { label: 'Đang thực hiện', badgeVariant: 'cockpit-badge--warning' }
    case 'paused':
      return { label: 'Tạm dừng', badgeVariant: 'cockpit-badge--neutral' }
    case 'unknown':
    default:
      return { label: 'Chưa cập nhật trạng thái', badgeVariant: 'cockpit-badge--neutral' }
  }
}

export interface ProvisionalProfitNamedInput {
  result: {
    state: 'provisional' | 'unavailable'
    amount: string | null
    basis?: string
    components?: { receipts?: string | null; cost?: string | null; independentlyHeldRetention?: string | null }
    reasons?: string[]
  } | null | undefined
  costState?: 'recorded' | 'needs_reconciliation' | 'not_recorded' | null
  resultReasons?: string[] | null
  currencyCode?: string
  moneyScale?: number
}

export function formatProvisionalProfitDisplay(
  input: ProvisionalProfitNamedInput,
): {
  label: string
  value: string
  caption: string | null
  tooltipText: string
  reasons: string | null
  isAvailable: boolean
  colorScheme: 'provisional' | 'danger' | 'unavailable' | 'profit' | 'negative'
  isNegative: boolean
} {
  const result = input.result
  const costState = input.costState
  const resultReasons = input.resultReasons
  const currencyCode = input.currencyCode ?? 'VND'
  const moneyScale = input.moneyScale ?? 0

  const label = 'Lợi nhuận tạm tính'

  if (result?.state === 'provisional' && result.amount != null) {
    const isNegative = result.amount.startsWith('-')
    const isPartialCost = costState === 'needs_reconciliation'
    const basisCaption = result.basis === 'owner_receipts' ? 'Theo số đã thu' : 'Tạm tính'
    const tooltipText = isPartialCost
      ? 'Lợi nhuận tạm tính = Thu từ CĐT - Chi phí ghi nhận - Bảo hành. Lưu ý: Chi phí chưa đối soát đầy đủ, kết quả mang tính chất tạm tính.'
      : 'Lợi nhuận tạm tính = Thu từ CĐT - Chi phí ghi nhận - Bảo hành.'

    return {
      label,
      value: formatFinanceMoney(result.amount, currencyCode, moneyScale) ?? '0',
      caption: basisCaption,
      tooltipText,
      reasons: isPartialCost ? 'Gồm chi phí chưa đối soát' : null,
      isAvailable: true,
      colorScheme: isNegative ? 'danger' : 'provisional',
      isNegative,
    }
  }

  const reasonsList = (resultReasons && resultReasons.length > 0)
    ? resultReasons
    : (result?.reasons && result.reasons.length > 0)
        ? result.reasons
        : null

  const reasonsFormatted = formatMarginReasons(reasonsList)

  return {
    label,
    value: 'Chưa đủ dữ liệu',
    caption: null,
    tooltipText: `Chưa đủ dữ liệu: ${reasonsFormatted}`,
    reasons: reasonsFormatted,
    isAvailable: false,
    colorScheme: 'unavailable',
    isNegative: false,
  }
}

export interface OwnerReceiptsInput {
  receipts: {
    state: 'recorded' | 'not_recorded' | 'needs_reconciliation'
    amount: string | null
    recordedCount?: number
  } | null | undefined
  budget?: {
    state: 'recorded' | 'not_recorded' | 'needs_reconciliation'
    amount: string | null
  } | null | undefined
  currencyCode?: string
  moneyScale?: number
}

/**
 * Formats Owner Receipts KPI display (R06).
 *
 * Requirements (R06):
 * 1. Binds strictly to summary.management.receipts, NOT management.reference.
 * 2. When budget=1000 and receipts=300, displays 300.
 * 3. When receipts missing/not_recorded, displays "Chưa ghi nhận" (never budget).
 * 4. Preserves budget as secondary text when present (e.g. "Dự toán: 1,000 VND").
 * 5. Distinct recorded zero ("0 VND") vs missing ("Chưa ghi nhận").
 */
export function formatOwnerReceiptsDisplay(
  input: OwnerReceiptsInput,
) {
  const receipts = input.receipts
  const budget = input.budget
  const currencyCode = input.currencyCode ?? 'VND'
  const moneyScale = input.moneyScale ?? 0

  const label = 'Thu từ chủ đầu tư'
  let value: string
  let badgeVariant = 'cockpit-badge--accent'
  let colorScheme: 'receipts' | 'neutral' = 'receipts'
  let isAvailable = false
  const state = receipts?.state ?? 'not_recorded'

  if (receipts?.state === 'recorded' && receipts.amount != null) {
    value = formatFinanceMoney(receipts.amount, currencyCode, moneyScale) ?? '0'
    isAvailable = true
  }
  else if (receipts?.state === 'needs_reconciliation') {
    value = 'Chưa đối soát'
    badgeVariant = 'cockpit-badge--warning'
  }
  else {
    value = 'Chưa ghi nhận'
    badgeVariant = 'cockpit-badge--neutral'
    colorScheme = 'neutral'
  }

  const budgetFormatted = (budget?.state === 'recorded' && budget.amount != null)
    ? formatFinanceMoney(budget.amount, currencyCode, moneyScale)
    : null
  const budgetSecondaryText = budgetFormatted ? `Dự toán: ${budgetFormatted}` : null

  const isOwnerReceipts = receipts?.state === 'recorded'
  const tooltipText = isOwnerReceipts
    ? 'Số tham chiếu là khoản thu từ chủ đầu tư, không phải dự toán.'
    : (budgetFormatted ? `Dự toán: ${budgetFormatted}` : null)
  const hasDisclosure = Boolean(tooltipText)

  return {
    label,
    value,
    badgeVariant,
    colorScheme,
    isAvailable,
    state,
    recordedCount: receipts?.recordedCount ?? 0,
    budgetSecondaryText,
    tooltipText,
    hasDisclosure,
    isOwnerReceipts,
  }
}

export function formatManagementHeadline(
  headline: { kind: 'provisional_result' | 'owner_receipts' | 'unavailable'; amount: string | null; basis: string } | null | undefined,
  _receipts: { quality?: string; coverage?: string } | null | undefined,
  resultReasons: string[] | null | undefined,
  marginReasons: string[] | null | undefined,
  currencyCode?: string,
  moneyScale = 0,
): {
  label: string
  value: string
  caption: string | null
  reasons: string | null
  isAvailable: boolean
  colorScheme: 'provisional' | 'receipts' | 'unavailable'
  isNegative: boolean
} {
  if (headline?.kind === 'provisional_result' && headline.amount != null) {
    const basisCaption = headline.basis === 'provisional_owner_receipts_result'
      ? 'Theo số đã thu'
      : headline.basis.includes('budget')
        ? 'Theo dự toán'
        : 'Kết quả tạm tính'
    const isNegative = headline.amount.startsWith('-')
    return {
      label: 'Kết quả tạm tính',
      value: formatFinanceMoney(headline.amount, currencyCode, moneyScale) ?? '0',
      caption: basisCaption,
      reasons: null,
      isAvailable: true,
      colorScheme: 'provisional',
      isNegative,
    }
  }

  if (headline?.kind === 'owner_receipts' && headline.amount != null) {
    const isNegative = headline.amount.startsWith('-')
    return {
      label: 'Thu từ chủ đầu tư',
      value: formatFinanceMoney(headline.amount, currencyCode, moneyScale) ?? '0',
      caption: null,
      reasons: null,
      isAvailable: true,
      colorScheme: 'receipts',
      isNegative,
    }
  }

  const reasonsList = (marginReasons && marginReasons.length > 0)
    ? marginReasons
    : (resultReasons && resultReasons.length > 0)
        ? resultReasons
        : null

  return {
    label: 'Lợi nhuận dự kiến',
    value: 'Chưa tính được',
    caption: null,
    reasons: formatMarginReasons(reasonsList),
    isAvailable: false,
    colorScheme: 'unavailable',
    isNegative: false,
  }
}

export function formatReferenceDisplay(
  reference: { kind: 'approved_budget' | 'owner_receipts' | 'owner_advance' | 'none'; amount: string | null; basis?: string },
  currencyCode?: string,
  moneyScale = 0,
  _receiptsQuality?: 'accounting_source_unverified' | 'not_recorded' | string,
) {
  if (reference.kind === 'approved_budget') {
    return {
      label: 'Dự toán được duyệt',
      value: reference.amount != null ? formatFinanceMoney(reference.amount, currencyCode, moneyScale)! : 'Chưa ghi nhận',
      isOwnerReceipts: false,
      badgeVariant: 'cockpit-badge--primary',
      colorScheme: 'budget',
      visibleCaption: null,
      warningMessage: null,
      tooltipText: null,
    }
  }
  if (reference.kind === 'owner_receipts' || reference.kind === 'owner_advance') {
    return {
      label: 'Thu từ chủ đầu tư',
      value: reference.amount != null ? formatFinanceMoney(reference.amount, currencyCode, moneyScale)! : 'Chưa ghi nhận',
      isOwnerReceipts: true,
      badgeVariant: 'cockpit-badge--accent',
      colorScheme: 'receipts',
      visibleCaption: null,
      warningMessage: null,
      tooltipText: 'Số tham chiếu là khoản thu từ chủ đầu tư, không phải dự toán.',
    }
  }
  return {
    label: 'Dự toán',
    value: 'Chưa ghi nhận',
    isOwnerReceipts: false,
    badgeVariant: 'cockpit-badge--neutral',
    colorScheme: 'neutral',
    visibleCaption: null,
    warningMessage: null,
    tooltipText: null,
  }
}

export interface CostDisplayInput {
  cost: {
    state: 'recorded' | 'not_recorded' | 'needs_reconciliation'
    amount: string | null
    knownSubtotal?: string | null
  } | null | undefined
  currencyCode?: string
  moneyScale?: number
}

export function formatCostDisplay(
  input: CostDisplayInput,
) {
  const cost = input.cost ?? { state: 'not_recorded', amount: null }
  const currencyCode = input.currencyCode ?? 'VND'
  const moneyScale = input.moneyScale ?? 0

  const hasKnownSubtotal = cost.knownSubtotal != null && cost.knownSubtotal !== '0.0000' && cost.state !== 'recorded'
  const knownSubtotalText = hasKnownSubtotal ? formatFinanceMoney(cost.knownSubtotal, currencyCode, moneyScale) : null

  let valueText: string
  let stateLabel: string | null = null
  let badgeVariant = 'cockpit-badge--warning-strong'

  if (cost.state === 'recorded' && cost.amount != null) {
    valueText = formatFinanceMoney(cost.amount, currencyCode, moneyScale)!
  }
  else if (cost.state === 'needs_reconciliation') {
    stateLabel = 'Chưa đối soát'
    valueText = knownSubtotalText ?? 'Chưa đối soát'
  }
  else {
    valueText = 'Chưa ghi nhận'
    badgeVariant = 'cockpit-badge--neutral'
  }

  return {
    label: 'Chi phí',
    value: valueText,
    state: cost.state,
    stateLabel,
    badgeVariant,
    knownSubtotal: knownSubtotalText,
    sublineLabel: knownSubtotalText,
  }
}

export interface WarrantyRetentionInput {
  warranty: {
    state: 'recorded' | 'not_recorded' | 'needs_reconciliation'
    amount: string | null
    recordedCount: number
  } | null | undefined
  currencyCode?: string
  moneyScale?: number
}

export function formatWarrantyRetentionDisplay(
  input: WarrantyRetentionInput,
) {
  const warranty = input.warranty ?? { state: 'not_recorded', amount: null, recordedCount: 0 }
  const currencyCode = input.currencyCode ?? 'VND'
  const moneyScale = input.moneyScale ?? 0

  let valueText: string
  if (warranty.state === 'recorded' && warranty.amount != null) {
    valueText = formatFinanceMoney(warranty.amount, currencyCode, moneyScale)!
  }
  else if (warranty.state === 'needs_reconciliation') {
    valueText = 'Chưa đối soát'
  }
  else {
    valueText = 'Chưa ghi nhận'
  }

  return {
    label: 'Bảo hành đã ghi nhận',
    value: valueText,
    countText: `(${formatRetentionCount(warranty.recordedCount)})`,
    recordedCount: warranty.recordedCount,
    state: warranty.state,
    badgeVariant: 'cockpit-badge--warranty',
  }
}

export function categoryDisplayName(code: string, name: string): string {
  if (name && name !== code) return name
  switch (code) {
    case 'materials': return 'Vật liệu'
    case 'machinery': return 'Máy thi công'
    case 'direct_labor': return 'Nhân công trực tiếp'
    case 'subcontract_labor': return 'Nhân công thầu phụ'
    case 'other': return 'Chi phí khác'
    default: return name || code
  }
}

export interface PageRetentionBreakdown {
  warranty: {
    amount: string | null
    count: number
    label: string
  } | null
  other: {
    amount: string | null
    count: number
    label: string
  } | null
}

/**
 * Computes separate warranty and other retention figures for page-level rows (R04).
 *
 * Requirements (R04):
 * 1. Warranty and other retention remain separate observations. Never sum warranty and other together.
 * 2. Explicitly labelled as page-only ("trên trang này").
 * 3. Keeps null distinct from recorded zero.
 */
export function computePageRetentionBreakdown(
  rows: Array<{ retentionAmount: string | null; retentionKind: 'warranty' | 'other' | null }> | undefined,
  currencyCode = 'VND',
  moneyScale = 0,
): PageRetentionBreakdown {
  if (!rows || rows.length === 0) {
    return { warranty: null, other: null }
  }

  let warrantyTotal = new Decimal(0)
  let warrantyCount = 0
  let hasWarranty = false

  let otherTotal = new Decimal(0)
  let otherCount = 0
  let hasOther = false

  for (const row of rows) {
    if (row.retentionAmount != null) {
      const amt = new Decimal(row.retentionAmount)
      if (row.retentionKind === 'warranty') {
        warrantyTotal = warrantyTotal.add(amt)
        warrantyCount++
        hasWarranty = true
      }
      else {
        otherTotal = otherTotal.add(amt)
        otherCount++
        hasOther = true
      }
    }
  }

  return {
    warranty: hasWarranty ? {
      amount: formatFinanceMoney(warrantyTotal.toFixed(4), currencyCode, moneyScale),
      count: warrantyCount,
      label: 'Bảo hành trên trang này',
    } : null,
    other: hasOther ? {
      amount: formatFinanceMoney(otherTotal.toFixed(4), currencyCode, moneyScale),
      count: otherCount,
      label: 'Khoản giữ lại khác trên trang này',
    } : null,
  }
}

export interface ProjectKpisViewModel {
  provisionalProfit: ReturnType<typeof formatProvisionalProfitDisplay>
  receipts: ReturnType<typeof formatOwnerReceiptsDisplay>
  cost: ReturnType<typeof formatCostDisplay>
  warranty: ReturnType<typeof formatWarrantyRetentionDisplay>
}

/**
 * Consolidates the four core financial KPI concepts across directory and project detail (R06, Improvement B).
 *
 * Concept 1: Lợi nhuận tạm tính (provisional profit)
 * Concept 2: Thu từ chủ đầu tư (owner receipts from summary.management.receipts)
 * Concept 3: Chi phí (recorded cost)
 * Concept 4: Bảo hành (warranty retention)
 */
export function computeProjectKpiCards(
  summary: {
    budget?: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; recordedCount?: number }
    cost?: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; knownSubtotal?: string | null }
    warrantyRetention?: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; recordedCount: number }
    management?: {
      receipts?: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; recordedCount?: number }
      result?: { state: 'provisional' | 'unavailable'; amount: string | null; basis?: string; reasons?: string[] }
    } | null
  } | null | undefined,
  project?: {
    currencyCode?: string
    moneyScale?: number
  } | null,
): ProjectKpisViewModel {
  const currencyCode = project?.currencyCode ?? 'VND'
  const moneyScale = project?.moneyScale ?? 0

  const safeSummary = summary ?? {}

  return {
    provisionalProfit: formatProvisionalProfitDisplay({
      result: safeSummary.management?.result,
      costState: safeSummary.cost?.state,
      resultReasons: safeSummary.management?.result?.reasons,
      currencyCode,
      moneyScale,
    }),
    receipts: formatOwnerReceiptsDisplay({
      receipts: safeSummary.management?.receipts,
      budget: safeSummary.budget,
      currencyCode,
      moneyScale,
    }),
    cost: formatCostDisplay({
      cost: safeSummary.cost ?? { state: 'not_recorded', amount: null },
      currencyCode,
      moneyScale,
    }),
    warranty: formatWarrantyRetentionDisplay({
      warranty: safeSummary.warrantyRetention ?? { state: 'not_recorded', amount: null, recordedCount: 0 },
      currencyCode,
      moneyScale,
    }),
  }
}
