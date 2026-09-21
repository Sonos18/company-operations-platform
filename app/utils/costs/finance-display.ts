export function formatFinanceMoney(
  value: string | null | undefined,
  currencyCode?: string,
  moneyScale = 0,
): string | null {
  if (value == null) return null
  const trimmed = value.trim()
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

export function formatProvisionalProfitDisplay(
  result: {
    state: 'provisional' | 'unavailable' | string
    amount: string | null
    basis?: string
    components?: { receipts?: string | null; cost?: string | null; independentlyHeldRetention?: string | null }
    reasons?: string[]
  } | null | undefined,
  arg2?: string,
  arg3?: number | string[] | null,
  arg4?: string | null,
  arg5?: string[] | number | null,
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
  let currencyCode: string
  let moneyScale: number
  let costState: string | undefined
  let resultReasons: string[] | null | undefined

  if (arg2 === 'recorded' || arg2 === 'needs_reconciliation' || arg2 === 'not_recorded') {
    costState = arg2
    resultReasons = Array.isArray(arg3) ? arg3 : null
    currencyCode = typeof arg4 === 'string' ? arg4 : 'VND'
    moneyScale = typeof arg5 === 'number' ? arg5 : 0
  }
  else {
    currencyCode = typeof arg2 === 'string' ? arg2 : 'VND'
    moneyScale = typeof arg3 === 'number' ? arg3 : 0
    costState = typeof arg4 === 'string' ? arg4 : undefined
    resultReasons = Array.isArray(arg5) ? arg5 : null
  }

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

export function formatCostDisplay(
  cost: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; knownSubtotal?: string | null },
  currencyCode?: string,
  moneyScale = 0,
) {
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

export function formatWarrantyRetentionDisplay(
  warranty: { state: 'recorded' | 'not_recorded' | 'needs_reconciliation'; amount: string | null; recordedCount: number },
  currencyCode?: string,
  moneyScale = 0,
) {
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
