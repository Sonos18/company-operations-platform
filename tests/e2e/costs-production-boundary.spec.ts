import Decimal from 'decimal.js'
import {
  financeItemDetailsSchema,
  financeOverviewSchema,
  financeSubcontractDetailSchema,
  financeSubcontractorListSchema,
  type FinanceItemDetails,
  type FinanceSubcontractDetail,
  type ItemDetailQuery,
  type PaymentQuery,
} from '../../shared/schemas/costs/project-finance'
import { expect, test } from './fixtures/authenticated'

function toDecimalString(val: number | string): string {
  return new Decimal(val).toFixed(4)
}

const projectIdAlpha = '10000000-0000-4000-8000-000000000101'
const categoryIdMat = '20000000-0000-4000-8000-000000000001'
const categoryIdSub = '20000000-0000-4000-8000-000000000002'
const item1Id = '30000000-0000-4000-8000-000000000001'
const contractIdAlpha = '50000000-0000-4000-8000-000000000001'
const contractorPartyId = '40000000-0000-4000-8000-000000000001'

const mockProjectAlpha = {
  projectId: projectIdAlpha,
  projectCode: 'C101-P1',
  projectName: 'Synthetic Project Alpha',
  currencyCode: 'VND',
  moneyScale: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
  operationalState: 'active' as const,
}

const mockOverviewAlpha = financeOverviewSchema.parse({
  schemaVersion: 1,
  project: mockProjectAlpha,
  summary: {
    budget: { state: 'recorded', amount: '250000000.0000', recordedCount: 2 },
    ownerAdvances: { state: 'not_recorded', amount: null, recordedCount: 0 },
    cost: { state: 'recorded', amount: '227530000.0000', recordedCount: 6, knownSubtotal: '227530000.0000' },
    warrantyRetention: { state: 'recorded', amount: '5376500.0000', recordedCount: 2 },
    reference: { kind: 'approved_budget', amount: '250000000.0000' },
    margin: { state: 'unavailable', amount: null, reasons: [] },
    management: {
      receipts: { state: 'recorded', amount: '250000000.0000', recordedCount: 2, origin: 'canonical_ledger', quality: 'accounting_source_unverified', coverage: 'recorded_rows_only', sourceReferences: [] },
      reference: { kind: 'owner_receipts', amount: '250000000.0000', basis: 'recorded_owner_receipts' },
      result: {
        state: 'provisional',
        amount: '17093500.0000',
        basis: 'owner_receipts',
        components: { receipts: '250000000.0000', cost: '227530000.0000', independentlyHeldRetention: '5376500.0000' },
        reasons: [],
      },
      headline: { kind: 'provisional_result', amount: '17093500.0000', basis: 'provisional_owner_receipts_result' },
    },
    issues: [],
  },
  categories: [
    {
      categoryId: categoryIdMat,
      code: 'materials',
      name: 'Vật liệu',
      displayOrder: 1,
      isActive: true,
      itemId: item1Id,
      description: 'Cung cấp vật tư công trình',
      businessReference: 'PO-MAT-01',
      cost: { state: 'recorded', amount: '120000000.0000', recordedCount: 4 },
      detailCount: 65,
      latestRecordedDate: '2026-08-20',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'recorded', amount: '3500000.0000', recordedCount: 2 },
      recordedPaymentsTotal: null,
      recordedPaymentCount: 0,
      legacyReconciliationRequired: false,
    },
    {
      categoryId: categoryIdSub,
      code: 'subcontract_labor',
      name: 'Nhân công thầu phụ',
      displayOrder: 2,
      isActive: true,
      itemId: null,
      description: 'Gia công và nhân công tại chỗ',
      businessReference: null,
      cost: { state: 'needs_reconciliation', amount: null, recordedCount: 1 },
      detailCount: 0,
      latestRecordedDate: '2026-08-22',
      latestRecordedDateSource: 'business_date',
      warrantyRetention: { state: 'recorded', amount: '5376500.0000', recordedCount: 2 },
      recordedPaymentsTotal: '107530000.0000',
      recordedPaymentCount: 65,
      legacyReconciliationRequired: true,
    },
  ],
})

// ---------------------------------------------------------------------------
// 65 Synthetic Ordinary Rows
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
    quantity: index === 10 ? '2.5000' : '1.0000',
    unitCode: index === 10 ? 'm3' : 'm',
    unitPrice: index === 10 ? toDecimalString(amount.dividedBy(2.5)) : toDecimalString(amount),
    amount: toDecimalString(amount),
    retentionKind: isWarranty ? ('warranty' as const) : isOther ? ('other' as const) : null,
    retentionRateBps: retentionRate,
    retentionAmount,
    relevantDate: dateStr,
    effectiveDate: dateStr,
    dateSource: 'relevant_date' as const,
    reference: `REF-${String(index).padStart(4, '0')}`,
    note: index === 10 ? 'Ghi chú nghiệm thu hiện trường đợt 10 đầy đủ' : index % 5 === 0 ? `Ghi chú hạng mục ${index}` : null,
    createdAt: `${dateStr}T08:00:00.000Z`,
    version: 0,
  }
})

const ordinaryFullAmount = baseOrdinaryRows
  .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
  .toFixed(4)

function paginateOrdinaryRows(query: Partial<ItemDetailQuery> = {}): FinanceItemDetails['details'] {
  const q = (query.q ?? '').trim().toLowerCase()
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo
  const retention = query.retention ?? 'all'
  const pageSize = (query.pageSize ?? 25) as 25 | 50 | 100
  const requestedPage = query.page ?? 1

  const filtered = baseOrdinaryRows.filter((row) => {
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
      fullCount: baseOrdinaryRows.length,
      filteredAmount,
      fullAmount: ordinaryFullAmount,
    },
  }
}

// ---------------------------------------------------------------------------
// 65 Synthetic Payment Rows
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
    contractId: contractIdAlpha,
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
    note: index === 5 ? 'Lưu ý kiểm tra đối soát đợt 5' : isWarranty ? 'Bảo hành 5%' : null,
    createdAt: `${dateStr}T10:00:00.000Z`,
    version: 0,
  }
})

const paymentFullAmount = basePaymentRows
  .reduce((sum, r) => sum.plus(new Decimal(r.paidAmount)), new Decimal(0))
  .toFixed(4)

function paginatePaymentRows(query: Partial<PaymentQuery> = {}): FinanceSubcontractDetail['payments'] {
  const q = (query.q ?? '').trim().toLowerCase()
  const dateFrom = query.dateFrom
  const dateTo = query.dateTo
  const retention = query.retention ?? 'all'
  const pageSize = (query.pageSize ?? 25) as 25 | 50 | 100
  const requestedPage = query.page ?? 1

  const filtered = basePaymentRows.filter((row) => {
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

  return {
    rows: pageRows,
    pagination: {
      page: clampedPage,
      pageSize,
      totalPages,
      filteredCount: filtered.length,
      fullCount: basePaymentRows.length,
      filteredAmount,
      fullAmount: paymentFullAmount,
    },
    recordedTotal: paymentFullAmount,
    recordedCount: basePaymentRows.length,
    recordedRetentionTotal: '10000000.0000',
    recordedRetentionRowCount: 32,
  }
}

function makeItemDetailsPayload(details: Extract<FinanceItemDetails, { kind: 'ordinary' }>['details']) {
  return financeItemDetailsSchema.parse({
    schemaVersion: 1 as const,
    kind: 'ordinary' as const,
    project: mockProjectAlpha,
    category: mockOverviewAlpha.categories[0],
    item: {
      id: item1Id,
      description: 'Cung cấp vật tư công trình',
      businessReference: 'PO-MAT-01',
      parentAmount: '120000000.0000',
      currencyCode: 'VND',
      version: 1,
    },
    details,
  })
}

function makeSubcontractDetailPayload(payments: FinanceSubcontractDetail['payments']) {
  return financeSubcontractDetailSchema.parse({
    schemaVersion: 1 as const,
    project: mockProjectAlpha,
    party: {
      partyId: contractorPartyId,
      code: 'SUB-01',
      displayName: 'Công ty Cơ điện MPE',
      partyKind: 'organization' as const,
    },
    contract: {
      id: contractIdAlpha,
      code: 'HD-SUB-01',
      contractNo: 'SUB-2026-01',
      contractName: 'Thi công cơ điện MEP',
      contractDate: '2026-08-01',
      contractValue: '500000000.0000',
      currencyCode: 'VND',
      defaultRetentionRateBps: 500,
      isActive: true,
      version: 1,
      reference: 'REF-SUB-01',
      sourceReference: null,
      note: 'Hợp đồng thầu phụ MEP',
      paidTotal: paymentFullAmount,
      paidCount: basePaymentRows.length,
      recordedRetentionTotal: '10000000.0000',
      recordedRetentionRowCount: 32,
      referenceHeadroom: '37093500.0000',
      referenceHeadroomReason: null,
    },
    payments,
  })
}

const mockSubcontractorsList = financeSubcontractorListSchema.parse({
  schemaVersion: 1 as const,
  project: mockProjectAlpha,
  coverage: 'needs_reconciliation' as const,
  parties: [
    {
      party: {
        partyId: contractorPartyId,
        code: 'SUB-01',
        displayName: 'Công ty Cơ điện MPE',
        partyKind: 'organization' as const,
      },
      contracts: [
        {
          id: contractIdAlpha,
          code: 'HD-SUB-01',
          contractNo: 'SUB-2026-01',
          contractName: 'Thi công cơ điện MEP',
          contractDate: '2026-08-01',
          contractValue: '500000000.0000',
          currencyCode: 'VND',
          defaultRetentionRateBps: 500,
          isActive: true,
          version: 1,
          paidTotal: paymentFullAmount,
          paidCount: basePaymentRows.length,
          recordedRetentionTotal: '10000000.0000',
          recordedRetentionRowCount: 32,
        },
      ],
    },
  ],
})

test.describe('RR01-RR05 Production Boundary Regressions', () => {
  test.beforeEach(async ({ page }) => {
    // Standard overview route
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance`, async (route) => {
      await route.fulfill({ json: mockOverviewAlpha })
    })
  })

  test('RR01 & RR05 (1): Ordinary ledger real pagination 1 -> 2 -> 3 -> Previous with distinct row IDs and pageSize 25/50/100', async ({ page }) => {
    const requestedUrls: string[] = []

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const url = route.request().url()
      requestedUrls.push(url)
      const parsed = new URL(url)
      const q = parsed.searchParams.get('q') ?? undefined
      const dateFrom = parsed.searchParams.get('dateFrom') ?? undefined
      const dateTo = parsed.searchParams.get('dateTo') ?? undefined
      const retention = (parsed.searchParams.get('retention') as ItemDetailQuery['retention']) ?? undefined
      const p = parsed.searchParams.get('page') ? Number(parsed.searchParams.get('page')) : 1
      const ps = (parsed.searchParams.get('pageSize') ? Number(parsed.searchParams.get('pageSize')) : 25) as 25 | 50 | 100

      const details = paginateOrdinaryRows({ q, dateFrom, dateTo, retention, page: p, pageSize: ps })
      await route.fulfill({ json: makeItemDetailsPayload(details) })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // 1. Initial Page 1
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 1 / 3')
    await expect(page.getByTestId('ordinary-prev-page-btn')).toBeDisabled()
    await expect(page.getByTestId('ordinary-next-page-btn')).toBeEnabled()
    await expect(page.getByText('Vận chuyển cát san lấp đợt 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Thi công khoan cọc cống đợt 26', { exact: true })).toHaveCount(0)

    // 2. Next to Page 2
    await page.getByTestId('ordinary-next-page-btn').click()
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 2 / 3')
    await expect(page.getByTestId('ordinary-prev-page-btn')).toBeEnabled()
    await expect(page.getByText('Thi công khoan cọc cống đợt 26', { exact: true })).toBeVisible()
    await expect(page.getByText('Vận chuyển cát san lấp đợt 1', { exact: true })).toHaveCount(0)

    // 3. Next to Page 3
    await page.getByTestId('ordinary-next-page-btn').click()
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 3 / 3')
    await expect(page.getByTestId('ordinary-next-page-btn')).toBeDisabled()
    await expect(page.getByText('Vận chuyển cát san lấp đợt 65', { exact: true })).toBeVisible()

    // 4. Previous to Page 2
    await page.getByTestId('ordinary-prev-page-btn').click()
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 2 / 3')
    await expect(page.getByText('Thi công khoan cọc cống đợt 26', { exact: true })).toBeVisible()

    // 5. Change Page Size to 50
    await page.getByTestId('ordinary-page-size-select').selectOption('50')
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 1 / 2')
    await expect(page.getByText('Vận chuyển cát san lấp đợt 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Thi công khoan cọc cống đợt 50', { exact: true })).toBeVisible()
    await expect(page.getByText('Vận chuyển cát san lấp đợt 51', { exact: true })).toHaveCount(0)

    // 6. Change Page Size to 100
    await page.getByTestId('ordinary-page-size-select').selectOption('100')
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 1 / 1')
    await expect(page.getByText('Vận chuyển cát san lấp đợt 65', { exact: true })).toBeVisible()

    // Assert outgoing requests had exact serialized parameters
    expect(requestedUrls.some(u => u.includes('page=2'))).toBe(true)
    expect(requestedUrls.some(u => u.includes('page=3'))).toBe(true)
    expect(requestedUrls.some(u => u.includes('pageSize=50'))).toBe(true)
    expect(requestedUrls.some(u => u.includes('pageSize=100'))).toBe(true)
  })

  test('RR01 & RR05 (2): Search and date filters, clearing search alone, each date bound alone, and clear-all with parameter absence', async ({ page }) => {
    let lastRequestUrl = ''

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      lastRequestUrl = route.request().url()
      const parsed = new URL(lastRequestUrl)
      const q = parsed.searchParams.get('q') ?? undefined
      const dateFrom = parsed.searchParams.get('dateFrom') ?? undefined
      const dateTo = parsed.searchParams.get('dateTo') ?? undefined
      const retention = (parsed.searchParams.get('retention') as ItemDetailQuery['retention']) ?? undefined
      const p = parsed.searchParams.get('page') ? Number(parsed.searchParams.get('page')) : 1
      const ps = (parsed.searchParams.get('pageSize') ? Number(parsed.searchParams.get('pageSize')) : 25) as 25 | 50 | 100

      const details = paginateOrdinaryRows({ q, dateFrom, dateTo, retention, page: p, pageSize: ps })
      await route.fulfill({ json: makeItemDetailsPayload(details) })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // Apply Search
    const searchInput = page.getByTestId('ordinary-search-input')
    await searchInput.fill('khoan')
    // Wait for 300ms debounce
    await expect.poll(() => lastRequestUrl).toContain('q=khoan')

    // Apply Dates
    const dateFromInput = page.getByTestId('ordinary-date-from')
    const dateToInput = page.getByTestId('ordinary-date-to')
    await dateFromInput.fill('2026-08-05')
    await expect.poll(() => lastRequestUrl).toContain('dateFrom=2026-08-05')

    await dateToInput.fill('2026-08-20')
    await expect.poll(() => lastRequestUrl).toContain('dateTo=2026-08-20')

    // Filtered totals banner is shown
    await expect(page.getByTestId('ordinary-filtered-totals')).toBeVisible()

    // 1. Clear search alone: parameter 'q' must be completely absent from next request URL
    await searchInput.fill('')
    await expect.poll(() => {
      const u = new URL(lastRequestUrl)
      return !u.searchParams.has('q') && u.searchParams.has('dateFrom')
    }).toBe(true)

    // 2. Clear dateFrom alone: parameter 'dateFrom' must be completely absent
    await dateFromInput.fill('')
    await expect.poll(() => {
      const u = new URL(lastRequestUrl)
      return !u.searchParams.has('dateFrom') && u.searchParams.has('dateTo')
    }).toBe(true)

    // 3. Clear dateTo alone
    await dateToInput.fill('')
    await expect.poll(() => {
      const u = new URL(lastRequestUrl)
      return !u.searchParams.has('dateTo')
    }).toBe(true)

    // 4. Test "Clear all filters" button
    await searchInput.fill('khoan')
    await expect.poll(() => lastRequestUrl).toContain('q=khoan')
    await dateFromInput.fill('2026-08-05')
    await expect.poll(() => lastRequestUrl).toContain('dateFrom=2026-08-05')

    await expect(page.getByTestId('clear-ordinary-filters-btn')).toBeVisible()
    await page.getByTestId('clear-ordinary-filters-btn').click()

    await expect(searchInput).toHaveValue('')
    await expect(dateFromInput).toHaveValue('')
    await expect(dateToInput).toHaveValue('')

    await expect.poll(() => {
      const u = new URL(lastRequestUrl)
      return !u.searchParams.has('q') && !u.searchParams.has('dateFrom') && !u.searchParams.has('dateTo')
    }).toBe(true)
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 1 / 3')
  })

  test('RR01 & RR05 (3): Filter producing no matches shows honest empty state with clear action, and context switch cleans up', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const parsed = new URL(route.request().url())
      const q = parsed.searchParams.get('q') ?? undefined
      const details = paginateOrdinaryRows({ q })
      await route.fulfill({ json: makeItemDetailsPayload(details) })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // Type query with 0 matches
    await page.getByTestId('ordinary-search-input').fill('khong_co_ket_qua_nao_ca')
    await expect(page.getByTestId('ordinary-ledger-empty')).toBeVisible()
    await expect(page.getByText('Chưa có chi tiết cho hạng mục này phù hợp với điều kiện tìm kiếm.')).toBeVisible()

    // Clear filter button in empty state restores full rows
    const clearBtn = page.getByTestId('ordinary-empty-clear-filters-btn')
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()

    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()
    await expect(page.getByTestId('ordinary-search-input')).toHaveValue('')

    // Navigate to project and back: no hidden stale query retained
    await page.getByTestId('back-to-project-link').click()
    await expect(page).toHaveURL(new RegExp(`/costs/${projectIdAlpha}$`))

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()
    await expect(page.getByTestId('ordinary-search-input')).toHaveValue('')
  })

  test('RR02 & RR05 (4): Immediate invalidation on typing rejects stale response resolving during debounce', async ({ page }) => {
    let resolveFirstRequest: (() => void) | null = null

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('q') ?? ''

      if (q === '') {
        // First initial request
        const details = paginateOrdinaryRows({})
        await route.fulfill({ json: makeItemDetailsPayload(details) })
      }
      else if (q === 'delayed_first') {
        // Delay this response until we manually resolve
        const details = paginateOrdinaryRows({ q: 'delayed_first' })
        const payload = makeItemDetailsPayload(details)
        await new Promise<void>((resolve) => {
          resolveFirstRequest = () => {
            void route.fulfill({ json: payload })
            resolve()
          }
        })
      }
      else {
        // Newer request
        const details = paginateOrdinaryRows({ q })
        await route.fulfill({ json: makeItemDetailsPayload(details) })
      }
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // 1. Type delayed_first and wait for it to be dispatched
    const searchInput = page.getByTestId('ordinary-search-input')
    await searchInput.fill('delayed_first')
    // Wait until resolveFirstRequest is assigned
    await expect.poll(() => resolveFirstRequest != null).toBe(true)

    // 2. Before delayed_first resolves, user immediately types a new intent 'khoan'
    await searchInput.fill('khoan')

    // 3. Now resolve the older delayed_first response
    if (resolveFirstRequest) {
      resolveFirstRequest()
    }

    // 4. The page MUST show results for 'khoan', NEVER flash or retain 'delayed_first'
    await expect(page.getByText('Thi công khoan cọc cống đợt 2', { exact: true })).toBeVisible()
  })

  test('RR03 & RR05 (7): Restored ordinary row fields (quantity, unitCode, unitPrice, reference AND note) exposed on desktop and mobile 390px', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const details = paginateOrdinaryRows({})
      await route.fulfill({ json: makeItemDetailsPayload(details) })
    })

    // Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // Verify row 10 exposes quantity, unitCode, unitPrice, reference AND note simultaneously
    const row10 = page.getByTestId('detail-row-60000000-0000-4000-8000-000000000010')
    await expect(row10).toBeVisible()
    await expect(row10.getByTestId('row-qty')).toHaveText('2.5000')
    await expect(row10.getByTestId('row-unit')).toHaveText('m3')
    await expect(row10.getByTestId('row-unit-price')).toContainText('VND')
    await expect(row10.getByTestId('row-reference')).toHaveText('REF-0010')
    await expect(row10.getByTestId('row-note')).toContainText('Ghi chú nghiệm thu hiện trường đợt 10 đầy đủ')

    // Mobile 390px: accessible via horizontal table scrolling without page-level overflow
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(row10).toBeVisible()
    await expect(row10.getByTestId('row-qty')).toHaveText('2.5000')
    await expect(row10.getByTestId('row-unit')).toHaveText('m3')
    await expect(row10.getByTestId('row-unit-price')).toContainText('VND')
    await expect(row10.getByTestId('row-reference')).toHaveText('REF-0010')
    await expect(row10.getByTestId('row-note')).toContainText('Ghi chú nghiệm thu hiện trường đợt 10 đầy đủ')

    // Assert no horizontal page overflow on 390px
    await expect.poll(() => page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('RR04 & RR05 (6): Actual ledger endpoint error states (module, permission, not_found, validation, server error with retry)', async ({ page }) => {
    let errorMode: 'server' | 'module' | 'permission' | 'not_found' | 'ready' = 'server'

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      if (errorMode === 'server') {
        await route.fulfill({
          status: 500,
          json: {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal Server Error',
              requestId: 'req-server-err',
              details: {},
            },
          },
        })
      }
      else if (errorMode === 'module') {
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Mô-đun quản lý chi phí chưa được kích hoạt cho công ty này.',
              requestId: 'req-module-err',
              details: { reason: 'MODULE_DISABLED' },
            },
          },
        })
      }
      else if (errorMode === 'permission') {
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Bạn không có quyền xem chi tiết chi phí.',
              requestId: 'req-perm-err',
              details: {},
            },
          },
        })
      }
      else if (errorMode === 'not_found') {
        await route.fulfill({
          status: 404,
          json: {
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'Hạng mục chi phí không tồn tại.',
              requestId: 'req-notfound-err',
              details: {},
            },
          },
        })
      }
      else {
        const details = paginateOrdinaryRows({})
        await route.fulfill({ json: makeItemDetailsPayload(details) })
      }
    })

    // 1. Server Error -> retryable state
    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-ledger-error')).toBeVisible()
    await expect(page.getByText('Không thể tải chi tiết hạng mục')).toBeVisible()

    // Change server to return ready on retry
    errorMode = 'ready'
    await page.getByTestId(`retry-details-${item1Id}`).click()
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // 2. Inverted date range -> local validation error prevents request
    const dateFrom = page.getByTestId('ordinary-date-from')
    const dateTo = page.getByTestId('ordinary-date-to')
    await dateFrom.fill('2026-08-25')
    await dateTo.fill('2026-08-05')
    await expect(page.getByTestId('ordinary-date-error')).toBeVisible()
    await expect(page.getByTestId('ordinary-date-error')).toContainText('trước ngày bắt đầu')

    // 3. Module Disabled
    errorMode = 'module'
    await page.reload()
    await expect(page.getByTestId('ordinary-ledger-module-disabled')).toBeVisible()
    await expect(page.getByText('Mô-đun quản lý chi phí chưa được kích hoạt cho công ty này.')).toBeVisible()

    // 4. Permission Denied
    errorMode = 'permission'
    await page.reload()
    await expect(page.getByTestId('ordinary-ledger-permission-denied')).toBeVisible()
    await expect(page.getByText('Bạn không có quyền xem chi tiết chi phí này.')).toBeVisible()
  })

  test('RR01-RR05 (8): Subcontract payment ledger real pagination, filtering, clear-filters, and reference/note exposure', async ({ page }) => {
    let lastPaymentUrl = ''

    // Subcontractors list mock
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontractors`, async (route) => {
      await route.fulfill({ json: mockSubcontractorsList })
    })

    // Subcontract payments mock
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontracts/${contractIdAlpha}*`, async (route) => {
      lastPaymentUrl = route.request().url()
      const parsed = new URL(lastPaymentUrl)
      const q = parsed.searchParams.get('q') ?? undefined
      const dateFrom = parsed.searchParams.get('dateFrom') ?? undefined
      const dateTo = parsed.searchParams.get('dateTo') ?? undefined
      const retention = (parsed.searchParams.get('retention') as PaymentQuery['retention']) ?? undefined
      const p = parsed.searchParams.get('page') ? Number(parsed.searchParams.get('page')) : 1
      const ps = (parsed.searchParams.get('pageSize') ? Number(parsed.searchParams.get('pageSize')) : 25) as 25 | 50 | 100

      const payments = paginatePaymentRows({ q, dateFrom, dateTo, retention, page: p, pageSize: ps })
      await route.fulfill({ json: makeSubcontractDetailPayload(payments) })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdSub}?contractId=${contractIdAlpha}`)
    await expect(page.getByTestId('payments-table')).toBeVisible()

    // 1. Pagination 1 -> 2 -> 3 -> Previous
    await expect(page.getByTestId('payment-page-indicator')).toHaveText('Trang 1 / 3')
    await page.getByTestId('payment-next-page-btn').click()
    await expect(page.getByTestId('payment-page-indicator')).toHaveText('Trang 2 / 3')
    expect(lastPaymentUrl).toContain('page=2')

    await page.getByTestId('payment-next-page-btn').click()
    await expect(page.getByTestId('payment-page-indicator')).toHaveText('Trang 3 / 3')
    expect(lastPaymentUrl).toContain('page=3')

    await page.getByTestId('payment-prev-page-btn').click()
    await expect(page.getByTestId('payment-page-indicator')).toHaveText('Trang 2 / 3')

    // 2. Change page size to 50
    await page.getByTestId('payment-page-size-select').selectOption('50')
    await expect(page.getByTestId('payment-page-indicator')).toHaveText('Trang 1 / 2')
    expect(lastPaymentUrl).toContain('pageSize=50')

    // 3. Search and Clear
    const searchInput = page.getByTestId('payment-search-input')
    await searchInput.fill('tổ đội')
    await expect.poll(() => new URL(lastPaymentUrl).searchParams.get('q')).toBe('tổ đội')

    // Clear filters
    await page.getByTestId('clear-payment-filters-btn').click()
    await expect(searchInput).toHaveValue('')
    await expect.poll(() => new URL(lastPaymentUrl).searchParams.has('q')).toBe(false)

    // 4. Verify row with reference AND note renders both
    const row5 = page.getByTestId('payments-table').getByText('Lưu ý kiểm tra đối soát đợt 5')
    await expect(row5).toBeVisible()
    await expect(page.getByTestId('payments-table').getByText('PAY-0005')).toBeVisible()
  })

  test('RR02 & RR05 (E): Two started requests A and B where B resolves before A preserves newer B data', async ({ page }) => {
    let resolveRequestA: (() => void) | null = null

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const url = new URL(route.request().url())
      const retention = url.searchParams.get('retention')

      if (retention === 'warranty') {
        // Request B: fast response for warranty filter
        const details = paginateOrdinaryRows({ retention: 'warranty' })
        await route.fulfill({ json: makeItemDetailsPayload(details) })
      }
      else if (url.searchParams.get('dateFrom') === '2026-03-01') {
        // Request A: delayed response for dateFrom filter
        const details = paginateOrdinaryRows({ dateFrom: '2026-03-01' })
        const payload = makeItemDetailsPayload(details)
        await new Promise<void>((resolve) => {
          resolveRequestA = () => {
            void route.fulfill({ json: payload })
            resolve()
          }
        })
      }
      else {
        const details = paginateOrdinaryRows({})
        await route.fulfill({ json: makeItemDetailsPayload(details) })
      }
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()
    await expect(page.getByTestId('ordinary-page-indicator')).toHaveText('Trang 1 / 3')

    // 1. User sets dateFrom -> Request A begins and hangs
    await page.getByTestId('ordinary-date-from').fill('2026-03-01')
    await expect.poll(() => resolveRequestA != null).toBe(true)

    // 2. User changes retention filter to warranty -> Request B begins immediately and resolves immediately
    await page.getByTestId('ordinary-retention-select').selectOption('warranty')
    await expect(page.getByTestId('page-warranty-retention')).toBeVisible()

    // 3. Now resolve Request A (older response for dateFrom)
    if (resolveRequestA) {
      resolveRequestA()
    }

    // Give any potential stale handling a moment to settle
    await page.waitForTimeout(300)

    // 4. Assert Request B remains authoritative; Request A must not overwrite it!
    await expect(page.getByTestId('page-warranty-retention')).toBeVisible()
    await expect(page.getByTestId('ordinary-retention-select')).toHaveValue('warranty')
  })

  test('RR02 & RR05 (F): Selection transition discards in-flight contractor requests without writing stale data', async ({ page }) => {
    let resolveDelayedPayments: (() => void) | null = null

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontractors`, async (route) => {
      await route.fulfill({ json: mockSubcontractorsList })
    })

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/subcontracts/${contractIdAlpha}*`, async (route) => {
      const payments = paginatePaymentRows({})
      const payload = makeSubcontractDetailPayload(payments)
      await new Promise<void>((resolve) => {
        resolveDelayedPayments = () => {
          void route.fulfill({ json: payload })
          resolve()
        }
      })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdSub}`)
    await expect(page.getByTestId('subcontractor-table')).toBeVisible()

    // 1. Click on view contractor payments button (initiates delayed payment request)
    const viewBtn = page.getByTestId(`view-contractor-btn-${contractIdAlpha}`)
    await viewBtn.click()

    await expect.poll(() => resolveDelayedPayments != null).toBe(true)

    // 2. User clicks back to contractor list before payment resolves
    const backBtn = page.getByTestId('back-to-contractors-btn')
    await backBtn.click()
    await expect(page.getByTestId('subcontractor-table')).toBeVisible()

    // 3. Now resolve the delayed payments response
    if (resolveDelayedPayments) {
      resolveDelayedPayments()
    }

    // Give any potential stale handling a moment to settle
    await page.waitForTimeout(300)

    // 4. Subcontractors table must remain visible; payments view must not pop up
    await expect(page.getByTestId('subcontractor-table')).toBeVisible()
    await expect(page.getByTestId('payments-table')).toHaveCount(0)
  })

  test('RR04 & RR05 (I): Retention filter separation (warranty vs other vs no_recorded_retention) and page-level retention subtotal', async ({ page }) => {
    let lastQueryRetention: string | undefined

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/finance/items/${item1Id}/details*`, async (route) => {
      const url = new URL(route.request().url())
      lastQueryRetention = url.searchParams.get('retention') ?? undefined
      const p = Number(url.searchParams.get('page') ?? 1)
      const ps = (Number(url.searchParams.get('pageSize') ?? 25)) as 25 | 50 | 100
      const retention = (lastQueryRetention as ItemDetailQuery['retention']) ?? undefined

      const details = paginateOrdinaryRows({ retention, page: p, pageSize: ps })
      await route.fulfill({ json: makeItemDetailsPayload(details) })
    })

    await page.goto(`/costs/${projectIdAlpha}/categories/${categoryIdMat}`)
    await expect(page.getByTestId('ordinary-detail-table')).toBeVisible()

    // 1. Initial State: All retention kinds
    await expect(page.getByTestId('retention-summary-banner')).toBeVisible()
    await expect(page.getByTestId('page-warranty-retention')).toBeVisible()
    await expect(page.getByTestId('page-other-retention')).toBeVisible()

    // 2. Filter: Warranty retention only
    const retentionSelect = page.getByTestId('ordinary-retention-select')
    await retentionSelect.selectOption('warranty')
    await expect.poll(() => lastQueryRetention).toBe('warranty')
    await expect(page.getByTestId('page-warranty-retention')).toBeVisible()
    await expect(page.getByTestId('page-other-retention')).toHaveCount(0)

    // 3. Filter: Other retention only
    await retentionSelect.selectOption('other')
    await expect.poll(() => lastQueryRetention).toBe('other')
    await expect(page.getByTestId('page-other-retention')).toBeVisible()
    await expect(page.getByTestId('page-warranty-retention')).toHaveCount(0)

    // 4. Filter: No recorded retention
    await retentionSelect.selectOption('no_recorded_retention')
    await expect.poll(() => lastQueryRetention).toBe('no_recorded_retention')
    await expect(page.getByTestId('retention-summary-banner')).toHaveCount(0)

    // 5. Clear filter returns to all
    await page.getByTestId('clear-ordinary-filters-btn').click()
    await expect.poll(() => lastQueryRetention).toBe('all')
    await expect(page.getByTestId('page-warranty-retention')).toBeVisible()
    await expect(page.getByTestId('page-other-retention')).toBeVisible()
  })
})
