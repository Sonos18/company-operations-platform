import { financeOverviewSchema, type FinanceCategoryRow, type FinanceOverview, type MoneyObservation } from '../../../../shared/schemas/costs/project-finance'
import { deriveFinanceDate, compareFinanceRows } from '../../../../shared/utils/project-finance-dates'
import { subtractFinanceMoney, sumFinanceMoney } from '../../../../shared/utils/project-finance-money'
import { AppApiError } from '../../../utils/api-error'
import type { FinanceProjectContextRow, FinanceSummaryTableRows } from './project-finance.queries'

type RawCategory = FinanceSummaryTableRows['categories'][number]
type RawItem = FinanceSummaryTableRows['costItems'][number]
type RawDetail = FinanceSummaryTableRows['details'][number]
type RawPayment = FinanceSummaryTableRows['payments'][number]
type RawSubcontract = FinanceSummaryTableRows['subcontracts'][number]
type RawResolution = FinanceSummaryTableRows['resolutions'][number]

const expectedCategoryCodes = ['materials', 'machinery', 'direct_labor', 'subcontract_labor', 'other'] as const
const isZero = (value: string) => /^0(?:\.0*)?$/.test(value)

function observation(values: readonly string[]): MoneyObservation {
  return values.length === 0 ? { state: 'not_recorded', amount: null, recordedCount: 0 } : { state: 'recorded', amount: sumFinanceMoney(values), recordedCount: values.length }
}

function retentionObservation(rows: readonly { retentionKind?: string | null, retentionAmount: string | null }[]): MoneyObservation {
  const relevant = rows.filter(row => row.retentionKind === undefined || row.retentionKind === 'warranty')
  const known = relevant.flatMap(row => row.retentionAmount === null ? [] : [row.retentionAmount])
  if (known.length === 0) return { state: 'not_recorded', amount: null, recordedCount: 0 }
  if (known.length !== relevant.length) return { state: 'needs_reconciliation', amount: null, recordedCount: known.length }
  return { state: 'recorded', amount: sumFinanceMoney(known), recordedCount: known.length }
}

function effectivePaymentWarrantyRetention(payment: RawPayment, subcontracts: readonly RawSubcontract[]): { amount: string | null, explicit: boolean } {
  if (payment.warranty_retention_amount_text !== null) return { amount: payment.warranty_retention_amount_text, explicit: true }
  const contract = subcontracts.find(value => value.id === payment.project_subcontract_id)
  return contract?.warranty_retention_rate_bps === 0 ? { amount: '0.0000', explicit: false } : { amount: null, explicit: false }
}

function subcontractWarrantyObservation(payments: readonly RawPayment[], subcontracts: readonly RawSubcontract[]): MoneyObservation {
  if (payments.length === 0) return { state: 'not_recorded', amount: null, recordedCount: 0 }
  const effective = payments.map(payment => effectivePaymentWarrantyRetention(payment, subcontracts))
  const known = effective.flatMap(value => value.amount === null ? [] : [value.amount])
  const explicitCount = effective.filter(value => value.explicit).length
  if (known.length === 0) return { state: 'not_recorded', amount: null, recordedCount: 0 }
  if (known.length !== payments.length) return { state: 'needs_reconciliation', amount: null, recordedCount: explicitCount }
  return { state: 'recorded', amount: sumFinanceMoney(known), recordedCount: explicitCount }
}

function projectWarrantyObservation(details: readonly RawDetail[], payments: readonly RawPayment[], subcontracts: readonly RawSubcontract[], ordinaryItemIds: ReadonlySet<string>): MoneyObservation {
  const ordinary = details.filter(detail => ordinaryItemIds.has(detail.project_cost_item_id) && detail.retention_kind === 'warranty')
  const effectivePayments = payments.map(payment => effectivePaymentWarrantyRetention(payment, subcontracts))
  const knownPaymentAmounts = effectivePayments.flatMap(value => value.amount === null ? [] : [value.amount])
  const explicitPaymentCount = effectivePayments.filter(value => value.explicit).length
  if (ordinary.length === 0 && payments.length === 0) return { state: 'not_recorded', amount: null, recordedCount: 0 }
  if (knownPaymentAmounts.length !== payments.length) return { state: knownPaymentAmounts.length === 0 && ordinary.length === 0 ? 'not_recorded' : 'needs_reconciliation', amount: null, recordedCount: ordinary.length + explicitPaymentCount }
  return { state: 'recorded', amount: sumFinanceMoney([...ordinary.map(detail => detail.retention_amount_text!), ...knownPaymentAmounts]), recordedCount: ordinary.length + explicitPaymentCount }
}

function effectiveHeldRetention(payments: readonly RawPayment[], subcontracts: readonly RawSubcontract[]): string | null {
  if (payments.length === 0) return '0.0000'
  const known = payments.map(payment => effectivePaymentWarrantyRetention(payment, subcontracts).amount)
  if (known.some(value => value === null)) return null
  return sumFinanceMoney(known as string[])
}

function hasCanonicalSubcontractResolution(categoryId: string, resolutions: readonly RawResolution[]): boolean {
  return resolutions.some(value => value.cost_category_id === categoryId && value.resolution_code === 'canonical_subcontract_payments_authoritative')
}

function latestDate(rows: readonly { id: string, created_at: string, relevant_date?: string | null, line_no?: number }[], timeZone: string) {
  if (rows.length === 0) return { latestRecordedDate: null, latestRecordedDateSource: null } as const
  const mapped = rows.map(row => {
    const derived = deriveFinanceDate(row.relevant_date ?? null, row.created_at, timeZone)
    return { id: row.id, createdAt: row.created_at, lineNo: row.line_no, effectiveDate: derived.effectiveDate, source: derived.usedFallback ? 'created_at' as const : 'business_date' as const }
  }).sort((left, right) => compareFinanceRows(left, right, 'newest'))
  return { latestRecordedDate: mapped[0]!.effectiveDate, latestRecordedDateSource: mapped[0]!.source }
}

function categoryRow(category: RawCategory, items: readonly RawItem[], details: readonly RawDetail[], subcontracts: readonly RawSubcontract[], payments: readonly RawPayment[], resolutions: readonly RawResolution[], timeZone: string): FinanceCategoryRow {
  const categoryItems = items.filter(item => item.cost_category_id === category.id)
  const itemIds = new Set(categoryItems.map(item => item.id))
  const categoryDetails = details.filter(detail => itemIds.has(detail.project_cost_item_id))
  const legacyRowsExist = category.code === 'subcontract_labor' && categoryItems.some(item => !isZero(item.amount_text) || categoryDetails.some(detail => detail.project_cost_item_id === item.id))
  const legacy = legacyRowsExist && !hasCanonicalSubcontractResolution(category.id, resolutions)
  const recordedPayments = category.code === 'subcontract_labor' ? payments.filter(payment => payment.status === 'recorded') : []
  const costValues = category.code === 'subcontract_labor' ? recordedPayments.map(payment => payment.paid_amount_text) : categoryItems.map(item => item.amount_text)
  const cost = legacy ? { state: 'needs_reconciliation' as const, amount: null, recordedCount: categoryItems.length } : observation(costValues)
  const item = categoryItems.length === 1 ? categoryItems[0]! : null
  const dateRows = category.code === 'subcontract_labor'
    ? recordedPayments.map(payment => ({ id: payment.id, created_at: payment.created_at, relevant_date: payment.payment_date }))
    : categoryDetails.length > 0 ? categoryDetails : categoryItems
  return {
    categoryId: category.id,
    code: category.code,
    name: category.name,
    displayOrder: category.display_order,
    isActive: category.is_active,
    itemId: item?.id ?? null,
    description: item?.description ?? null,
    businessReference: item?.business_reference ?? null,
    cost,
    detailCount: categoryDetails.length,
    ...latestDate(dateRows, timeZone),
    warrantyRetention: category.code === 'subcontract_labor'
      ? subcontractWarrantyObservation(recordedPayments, subcontracts)
      : retentionObservation(categoryDetails.map(detail => ({ retentionKind: detail.retention_kind, retentionAmount: detail.retention_amount_text }))),
    recordedPaymentsTotal: category.code === 'subcontract_labor' ? sumFinanceMoney(recordedPayments.map(payment => payment.paid_amount_text)) : null,
    recordedPaymentCount: recordedPayments.length,
    legacyReconciliationRequired: legacy,
  }
}

function context(row: FinanceProjectContextRow, currencyCode: string) {
  return { projectId: row.projectId, projectCode: row.projectCode, projectName: row.projectName, currencyCode, moneyScale: row.moneyScale, timeZone: row.timeZone, operationalState: row.operationalState }
}

function currencySet(rows: Pick<FinanceSummaryTableRows, 'costItems' | 'budgets' | 'ownerAdvances' | 'subcontracts' | 'payments'>): Set<string> {
  const result = new Set<string>(rows.costItems.map(row => row.currency_code))
  for (const value of rows.budgets.filter(row => row.status === 'approved').map(row => row.currency_code)) if (value) result.add(value)
  for (const value of rows.ownerAdvances.filter(row => row.status === 'recorded').map(row => row.currency_code)) if (value) result.add(value)
  for (const value of rows.subcontracts.map(row => row.currency_code)) if (value) result.add(value)
  for (const value of rows.payments.filter(row => row.status === 'recorded').map(row => row.currency_code)) if (value) result.add(value)
  return result
}

export function summarizeFinanceRows(input: { context: FinanceProjectContextRow, rows: Omit<FinanceSummaryTableRows, 'resolutions'> & { resolutions?: FinanceSummaryTableRows['resolutions'] } }): FinanceOverview {
  const publishedCostItems = input.rows.costItems.filter(item => item.publication_state !== 'draft')
  const publishedCostItemIds = new Set(publishedCostItems.map(item => item.id))
  const rows = { ...input.rows, costItems: publishedCostItems, details: input.rows.details.filter(detail => publishedCostItemIds.has(detail.project_cost_item_id) && detail.publication_state === 'published') }
  const currencies = currencySet(rows)
  if (currencies.size > 1) throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu tài chính có nhiều loại tiền tệ.', { reason: 'MIXED_CURRENCY' })
  const currencyCode = [...currencies][0] ?? input.context.defaultCurrencyCode
  const project = context(input.context, currencyCode)
  const resolutions = rows.resolutions ?? []
  const categoryById = new Map(rows.categories.map(category => [category.id, category]))
  const categories = [...rows.categories].sort((left, right) => left.display_order - right.display_order || left.id.localeCompare(right.id)).map(category => categoryRow(category, rows.costItems, rows.details, rows.subcontracts, rows.payments, resolutions, input.context.timeZone))
  const unmapped = rows.costItems.filter(item => item.cost_category_id === null || !categoryById.has(item.cost_category_id))
  const missingCodes = expectedCategoryCodes.filter(code => !rows.categories.some(category => category.code === code))
  const approvedBudgets = rows.budgets.filter(budget => budget.status === 'approved')
  if (approvedBudgets.length > 1) throw new AppApiError(500, 'INTERNAL_ERROR', 'Dữ liệu ngân sách được duyệt không nhất quán.', { reason: 'DATA_CONSISTENCY_ERROR' })
  const approvedBudget = approvedBudgets[0] ?? null
  const advances = rows.ownerAdvances.filter(advance => advance.status === 'recorded')
  const categoryCost = categories.map(category => category.cost)
  const costComplete = unmapped.length === 0 && missingCodes.length === 0 && categoryCost.length > 0 && categoryCost.every(value => value.state === 'recorded')
  const knownSubtotal = sumFinanceMoney(categoryCost.filter(value => value.state === 'recorded').flatMap(value => value.amount === null ? [] : [value.amount]))
  const cost = { state: costComplete ? 'recorded' as const : unmapped.length > 0 || categories.some(category => category.legacyReconciliationRequired) ? 'needs_reconciliation' as const : 'not_recorded' as const, amount: costComplete ? knownSubtotal : null, recordedCount: categoryCost.filter(value => value.state === 'recorded').reduce((total, value) => total + value.recordedCount, 0), knownSubtotal }
  const budget = approvedBudget ? observation([approvedBudget.total_amount_text]) : observation([])
  const ownerAdvances = observation(advances.map(advance => advance.amount_text))
  const ordinaryItemIds = new Set(rows.costItems.filter(item => item.cost_category_id === null || categoryById.get(item.cost_category_id)?.code !== 'subcontract_labor').map(item => item.id))
  const recordedPayments = rows.payments.filter(payment => payment.status === 'recorded')
  const warrantyRetention = projectWarrantyObservation(rows.details, recordedPayments, rows.subcontracts, ordinaryItemIds)
  const hasWarrantyRelevantRows = rows.details.some(detail => ordinaryItemIds.has(detail.project_cost_item_id) && detail.retention_kind === 'warranty') || recordedPayments.length > 0
  const legacyCategory = categories.find(category => category.code === 'subcontract_labor')
  const issues = [
    ...missingCodes.map(() => ({ code: 'CATEGORY_CONFIGURATION_INCOMPLETE' as const, categoryId: null })),
    ...categories.filter(category => category.cost.state === 'not_recorded').map(category => ({ code: 'MISSING_CATEGORY_RECORD' as const, categoryId: category.categoryId })),
    ...(unmapped.length > 0 ? [{ code: 'UNMAPPED_COST_ITEM' as const, categoryId: null }] : []),
    ...(legacyCategory?.legacyReconciliationRequired ? [{ code: 'LEGACY_SUBCONTRACT_RECONCILIATION_REQUIRED' as const, categoryId: legacyCategory.categoryId }] : []),
    ...(warrantyRetention.state !== 'recorded' && hasWarrantyRelevantRows ? [{ code: 'RETENTION_NOT_RECORDED' as const, categoryId: null }] : []),
    ...(approvedBudget ? [{ code: 'BUDGET_BASIS_UNCONFIRMED' as const, categoryId: null }] : []),
  ]
  const reasons = [
    ...(approvedBudget ? [] : ['NO_APPROVED_BUDGET' as const]),
    ...(cost.state !== 'recorded' ? ['COST_INCOMPLETE' as const] : []),
    ...(warrantyRetention.state !== 'recorded' ? ['RETENTION_INCOMPLETE' as const] : []),
    ...(approvedBudget ? ['BUDGET_BASIS_UNCONFIRMED' as const] : []),
  ]
  const receipts = {
    ...ownerAdvances,
    origin: advances.length > 0 ? 'canonical_ledger' as const : 'none' as const,
    quality: advances.length > 0 ? 'accounting_source_unverified' as const : 'not_recorded' as const,
    coverage: advances.length > 0 ? 'recorded_rows_only' as const : 'none' as const,
    sourceReferences: [...new Set(advances.flatMap(advance => advance.source_reference === null ? [] : [advance.source_reference]))].sort(),
  }
  const managementReference = approvedBudget
    ? { kind: 'approved_budget' as const, amount: budget.amount, basis: 'unconfirmed_cost_budget' as const }
    : advances.length > 0
      ? { kind: 'owner_receipts' as const, amount: ownerAdvances.amount, basis: 'recorded_owner_receipts' as const }
      : { kind: 'none' as const, amount: null, basis: 'none' as const }
  const heldRetention = effectiveHeldRetention(recordedPayments, rows.subcontracts)
  const recordedCost = cost.amount
  const resultReasons = [
    ...(advances.length === 0 ? ['NO_REFERENCE' as const] : []),
    ...(recordedCost === null ? ['COST_INCOMPLETE' as const] : []),
    ...(heldRetention === null ? ['RETENTION_INCOMPLETE' as const] : []),
  ]
  const canCalculate = ownerAdvances.amount !== null && recordedCost !== null && heldRetention !== null
  const resultAmount = canCalculate ? subtractFinanceMoney(ownerAdvances.amount!, [recordedCost, heldRetention]) : null
  const management = {
    receipts,
    reference: managementReference,
    result: {
      state: canCalculate ? 'provisional' as const : 'unavailable' as const,
      amount: resultAmount,
      basis: advances.length > 0 ? 'owner_receipts' as const : approvedBudget ? 'approved_budget_unconfirmed' as const : 'none' as const,
      components: { receipts: ownerAdvances.amount, cost: recordedCost, independentlyHeldRetention: heldRetention },
      reasons: canCalculate ? [] : resultReasons,
    },
    headline: resultAmount !== null
      ? { kind: 'provisional_result' as const, amount: resultAmount, basis: 'provisional_owner_receipts_result' as const }
      : ownerAdvances.amount !== null
        ? { kind: 'owner_receipts' as const, amount: ownerAdvances.amount, basis: 'recorded_owner_receipts' as const }
        : { kind: 'unavailable' as const, amount: null, basis: 'none' as const },
  }
  return financeOverviewSchema.parse({
    schemaVersion: 1,
    project,
    summary: {
      budget,
      ownerAdvances,
      cost,
      warrantyRetention,
      reference: approvedBudget ? { kind: 'approved_budget', amount: sumFinanceMoney([approvedBudget.total_amount_text]) } : advances.length > 0 ? { kind: 'owner_advance', amount: sumFinanceMoney(advances.map(advance => advance.amount_text)) } : { kind: 'none', amount: null },
      margin: { state: 'unavailable', amount: null, reasons },
      management,
      issues,
    },
    categories,
  })
}

export function paymentTotal(payments: readonly Pick<RawPayment, 'paid_amount_text' | 'warranty_retention_amount_text' | 'status'>[], defaultRetentionRateBps: number | null = null) {
  const recorded = payments.filter(payment => payment.status === 'recorded')
  const explicitRetention = recorded.flatMap(payment => payment.warranty_retention_amount_text === null ? [] : [payment.warranty_retention_amount_text])
  const effectiveRetention = recorded.flatMap(payment => payment.warranty_retention_amount_text !== null ? [payment.warranty_retention_amount_text] : defaultRetentionRateBps === 0 ? ['0.0000'] : [])
  return { recorded, amount: sumFinanceMoney(recorded.map(payment => payment.paid_amount_text)), count: recorded.length, retentionAmount: effectiveRetention.length === 0 ? null : sumFinanceMoney(effectiveRetention), retentionCount: explicitRetention.length, retentionKnownCount: effectiveRetention.length }
}

export function referenceHeadroom(contractValue: string | null, payments: readonly RawPayment[], defaultRetentionRateBps: number | null = null) {
  const total = paymentTotal(payments, defaultRetentionRateBps)
  if (contractValue === null) return { value: null, reason: 'CONTRACT_VALUE_MISSING' as const }
  if (total.retentionKnownCount !== total.count) return { value: null, reason: 'RETENTION_NOT_RECORDED' as const }
  return { value: subtractFinanceMoney(contractValue, [total.amount, total.retentionAmount ?? '0.0000']), reason: null }
}
