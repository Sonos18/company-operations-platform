import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures/authenticated'
import { createCompany } from './fixtures/auth-routes'

const projectIdAlpha = '10000000-0000-4000-8000-000000000101'
const projectIdBeta = '10000000-0000-4000-8000-000000000102'

const mockSummaries = [
  {
    projectId: projectIdAlpha,
    projectCode: 'C101-P1',
    projectName: 'Synthetic Project Alpha',
    summary: {
      currencyCode: 'VND',
      acceptedValue: '242562376.0000',
      acceptedCount: 4,
      inProgressValue: '0.0000',
      inProgressCount: 0,
      unknownStatusValue: '15000000.0000',
      unknownCount: 1,
      totalTrackedWorkValue: '242562376.0000',
    },
  },
  {
    projectId: projectIdBeta,
    projectCode: 'C101-P2',
    projectName: 'Synthetic Project Beta',
    summary: {
      currencyCode: 'USD',
      acceptedValue: '0.0000',
      acceptedCount: 0,
      inProgressValue: '5641725896.0000',
      inProgressCount: 5,
      unknownStatusValue: '0.0000',
      unknownCount: 0,
      totalTrackedWorkValue: '5641725896.0000',
    },
  },
]

const mockBreakdownAlpha = {
  projectId: projectIdAlpha,
  projectCode: 'C101-P1',
  projectName: 'Synthetic Project Alpha',
  summary: {
    currencyCode: 'VND',
    acceptedValue: '242562376.0000',
    acceptedCount: 4,
    inProgressValue: '0.0000',
    inProgressCount: 0,
    unknownStatusValue: '15000000.0000',
    unknownCount: 1,
    totalTrackedWorkValue: '242562376.0000',
  },
  items: [
    {
      id: '10000000-0000-4000-8000-000000000201',
      tenantId: '10000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000002',
      projectId: projectIdAlpha,
      description: 'Thi công cọc khoan nhồi D800',
      amount: '120000000.0000',
      currencyCode: 'VND',
      workStatus: 'accepted' as const,
      businessReference: 'REF-ALPHA-01',
      partyId: '10000000-0000-4000-8000-000000000301',
      engagementId: '10000000-0000-4000-8000-000000000302',
      componentId: null,
      relevantDate: '2026-08-15',
      version: 1,
      createdAt: '2026-08-15T08:00:00.000Z',
      updatedAt: '2026-08-15T08:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000202',
      tenantId: '10000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000002',
      projectId: projectIdAlpha,
      description: 'Lắp đặt cốt thép đài móng',
      amount: '122562376.0000',
      currencyCode: 'VND',
      workStatus: 'accepted' as const,
      businessReference: null,
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: null,
      version: 1,
      createdAt: '2026-08-20T09:00:00.000Z',
      updatedAt: '2026-08-20T09:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000203',
      tenantId: '10000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000002',
      projectId: projectIdAlpha,
      description: 'Vật tư phụ khảo sát địa chất',
      amount: '15000000.0000',
      currencyCode: 'VND',
      workStatus: 'unknown' as const,
      businessReference: null,
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: '2026-08-25',
      version: 1,
      createdAt: '2026-08-25T10:00:00.000Z',
      updatedAt: '2026-08-25T10:00:00.000Z',
    },
  ],
}

const mockBreakdownBeta = {
  projectId: projectIdBeta,
  projectCode: 'C101-P2',
  projectName: 'Synthetic Project Beta',
  summary: {
    currencyCode: 'USD',
    acceptedValue: '0.0000',
    acceptedCount: 0,
    inProgressValue: '5641725896.0000',
    inProgressCount: 5,
    unknownStatusValue: '0.0000',
    unknownCount: 0,
    totalTrackedWorkValue: '5641725896.0000',
  },
  items: [
    {
      id: '10000000-0000-4000-8000-000000000204',
      tenantId: '10000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000002',
      projectId: projectIdBeta,
      description: 'Dịch vụ thiết kế hệ thống HVAC',
      amount: '5641725896.0000',
      currencyCode: 'USD',
      workStatus: 'in_progress' as const,
      businessReference: 'REF-BETA-01',
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: '2026-09-01',
      version: 1,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
    },
  ],
}

const item1Id = '10000000-0000-4000-8000-000000000201'
const item2Id = '10000000-0000-4000-8000-000000000202'
const item3Id = '10000000-0000-4000-8000-000000000203'

const mockItem1Details = {
  projectCostItemId: item1Id,
  totalAmount: '120000000.0000',
  currencyCode: 'VND',
  details: [
    {
      id: '10000000-0000-4000-8000-000000000501',
      projectCostItemId: item1Id,
      lineNo: 1,
      detailKind: 'opening_balance' as const,
      description: 'Số dư đầu kỳ cọc khoan nhồi',
      quantity: null,
      unitCode: null,
      unitPrice: null,
      amount: '50000000.0000',
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      relevantDate: '2026-08-01',
      reference: 'OB-01',
      note: 'Chuyển giao từ kỳ trước',
      version: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000502',
      projectCostItemId: item1Id,
      lineNo: 2,
      detailKind: 'line_item' as const,
      description: 'Khoan cọc thí nghiệm D800',
      quantity: '2.0000',
      unitCode: 'tim',
      unitPrice: '35000000.0000',
      amount: '70000000.0000',
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      relevantDate: '2026-08-15',
      reference: 'BB-01',
      note: null,
      version: 0,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    },
  ],
}

const mockItem2Details = {
  projectCostItemId: item2Id,
  totalAmount: '122562376.0000',
  currencyCode: 'VND',
  details: [
    {
      id: '10000000-0000-4000-8000-000000000503',
      projectCostItemId: item2Id,
      lineNo: 1,
      detailKind: 'line_item' as const,
      description: 'Thép CB400 d20 đài móng',
      quantity: '10.5000',
      unitCode: 'tấn',
      unitPrice: '11672607.2381',
      amount: '122562376.0000',
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      relevantDate: '2026-08-20',
      reference: 'HD-102',
      note: 'Đợt 1',
      version: 0,
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ],
}

const mockItem3Details = {
  projectCostItemId: item3Id,
  totalAmount: '15000000.0000',
  currencyCode: 'VND',
  details: [
    {
      id: '10000000-0000-4000-8000-000000000504',
      projectCostItemId: item3Id,
      lineNo: 1,
      detailKind: 'line_item' as const,
      description: 'Chi phí khoan mẫu địa chất',
      quantity: '1.0000',
      unitCode: 'gói',
      unitPrice: '15000000.0000',
      amount: '15000000.0000',
      retentionKind: null,
      retentionRateBps: null,
      retentionAmount: null,
      relevantDate: '2026-08-25',
      reference: null,
      note: null,
      version: 0,
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
  ],
}

const projectIdYongMei = '10000000-0000-4000-8000-000000000103'
const yongMeiItemId = '10000000-0000-4000-8000-000000000205'

const mockBreakdownYongMei = {
  projectId: projectIdYongMei,
  projectCode: 'YM-001',
  projectName: 'Dự án kết cấu thép Yong Mei',
  summary: {
    currencyCode: 'VND',
    acceptedValue: '0.0000',
    acceptedCount: 0,
    inProgressValue: '107530000.0000',
    inProgressCount: 1,
    unknownStatusValue: '0.0000',
    unknownCount: 0,
    totalTrackedWorkValue: '107530000.0000',
  },
  items: [
    {
      id: yongMeiItemId,
      tenantId: '10000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000002',
      projectId: projectIdYongMei,
      description: 'Gia công lắp dựng kết cấu thép Yong Mei',
      amount: '107530000.0000',
      currencyCode: 'VND',
      workStatus: 'in_progress' as const,
      businessReference: 'YM-SUBCONTRACT-01',
      partyId: null,
      engagementId: null,
      componentId: null,
      relevantDate: '2026-08-20',
      version: 1,
      createdAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
    },
  ],
}

const mockYongMeiDetails = {
  projectCostItemId: yongMeiItemId,
  totalAmount: '107530000.0000',
  currencyCode: 'VND',
  details: [
    {
      id: '10000000-0000-4000-8000-000000000505',
      projectCostItemId: yongMeiItemId,
      lineNo: 1,
      detailKind: 'line_item' as const,
      description: 'Gia công lắp dựng kết cấu thép Yong Mei đợt 1',
      quantity: '1.0000',
      unitCode: 'gói',
      unitPrice: '31200000.0000',
      amount: '31200000.0000',
      retentionKind: 'warranty' as const,
      retentionRateBps: 500,
      retentionAmount: '1560000.0000',
      relevantDate: '2026-08-10',
      reference: 'YM-01',
      note: 'Bảo hành 5%',
      version: 0,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000506',
      projectCostItemId: yongMeiItemId,
      lineNo: 2,
      detailKind: 'line_item' as const,
      description: 'Gia công lắp dựng kết cấu thép Yong Mei đợt 2',
      quantity: '1.0000',
      unitCode: 'gói',
      unitPrice: '76330000.0000',
      amount: '76330000.0000',
      retentionKind: 'warranty' as const,
      retentionRateBps: 500,
      retentionAmount: '3816500.0000',
      relevantDate: '2026-08-20',
      reference: 'YM-02',
      note: 'Bảo hành 5%',
      version: 0,
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    },
  ],
}

test.describe('Director Project Cost UI', () => {
  test('renders Project Cost overview on /costs, displays metrics, and excludes unknown from total', async ({ page }) => {
    let requestedProjectCosts = false
    let requestedCostSources = false

    await page.route('**/api/companies/**/project-costs', async (route) => {
      requestedProjectCosts = true
      await route.fulfill({ json: mockSummaries })
    })

    await page.route('**/api/companies/**/cost-sources', async (route) => {
      requestedCostSources = true
      await route.fulfill({ json: { projects: [], unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: null }, sourceCount: 0, figureCount: 0, openIssueCount: 0 } })
    })

    await page.goto('/costs')

    // Header and calm Vietnamese copywriting
    await expect(page.getByRole('heading', { level: 1, name: 'Chi phí dự án' })).toBeVisible()
    await expect(page.getByText('Theo dõi giá trị công việc theo từng dự án.')).toBeVisible()

    // Proves Project Cost repository is queried, NOT Cost Source
    expect(requestedProjectCosts).toBe(true)
    expect(requestedCostSources).toBe(false)

    // Project cards
    const alphaCard = page.getByTestId(`project-cost-card-${projectIdAlpha}`)
    await expect(alphaCard).toBeVisible()
    await expect(alphaCard.getByText('Synthetic Project Alpha')).toBeVisible()
    await expect(alphaCard.getByText('C101-P1')).toBeVisible()

    // Metrics verification
    // Total tracked must be 242,562,376 (does NOT include unknown 15,000,000)
    await expect(alphaCard.getByTestId('total-tracked-value')).toContainText('242,562,376')
    await expect(alphaCard.getByTestId('total-tracked-value')).toContainText('VND')
    await expect(alphaCard.getByTestId('accepted-value')).toContainText('242,562,376')
    await expect(alphaCard.getByTestId('accepted-count')).toContainText('4')
    await expect(alphaCard.getByTestId('unknown-value')).toContainText('15,000,000')
    await expect(alphaCard.getByTestId('unknown-count')).toContainText('1')

    // Beta card: USD summary currency verification
    const betaCard = page.getByTestId(`project-cost-card-${projectIdBeta}`)
    await expect(betaCard).toBeVisible()
    await expect(betaCard.getByText('Synthetic Project Beta')).toBeVisible()
    await expect(betaCard.getByText('C101-P2')).toBeVisible()
    await expect(betaCard.getByTestId('total-tracked-value')).toContainText('USD')
    await expect(betaCard.getByTestId('total-tracked-value')).not.toContainText('VND')

    // Business-only boundary: no forbidden technical/accounting terms
    const pageText = await page.locator('main').innerText()
    for (const forbidden of ['workbook', 'sheet', 'locator', 'sourceFigure', 'reconciliation', 'provenance', 'Công nợ', 'Lợi nhuận', 'Doanh thu', 'Đã thanh toán', 'Ngân sách']) {
      expect(pageText).not.toContain(forbidden)
    }

    // No raw UUID as business label
    expect(pageText).not.toContain(projectIdAlpha)
    expect(pageText).not.toContain(projectIdBeta)

    // Navigation to detail
    await alphaCard.click()
    await expect(page).toHaveURL(`/costs/${projectIdAlpha}`)
  })

  test('renders Project Cost detail on /costs/:projectId with item breakdown and back navigation', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Header & metadata
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Alpha')
    await expect(page.getByText('C101-P1')).toBeVisible()

    // Summary metrics in detail
    await expect(page.getByTestId('detail-total-tracked')).toContainText('242,562,376')
    await expect(page.getByTestId('detail-accepted')).toContainText('242,562,376')
    await expect(page.getByTestId('detail-unknown')).toContainText('15,000,000')

    // Items
    await expect(page.getByText('Thi công cọc khoan nhồi D800')).toBeVisible()
    await expect(page.getByText('120,000,000 VND')).toBeVisible()
    await expect(page.getByText('REF-ALPHA-01')).toBeVisible()
    await expect(page.getByText('15/08/2026')).toBeVisible()
    await expect(page.getByText('Lắp đặt cốt thép đài móng')).toBeVisible()
    await expect(page.getByText('Vật tư phụ khảo sát địa chất')).toBeVisible()

    // No raw UUIDs exposed as labels
    const content = await page.locator('main').innerText()
    expect(content).not.toContain('10000000-0000-4000-8000-000000000301')
    expect(content).not.toContain('10000000-0000-4000-8000-000000000302')

    // No write controls
    await expect(page.getByRole('button', { name: /Tạo|Thêm|Sửa|Cập nhật|Xóa/i })).toHaveCount(0)

    // Back link navigates to /costs
    const backLink = page.getByTestId('project-cost-detail').getByRole('link', { name: 'Quay lại danh sách chi phí dự án' })
    await expect(backLink).toHaveAttribute('href', '/costs')
  })

  test('renders Project Cost detail for USD project with correct summary currency and no hardcoded VND', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdBeta}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownBeta })
    })

    await page.goto(`/costs/${projectIdBeta}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Beta')
    const totalTracked = page.getByTestId('detail-total-tracked')
    await expect(totalTracked).toContainText('USD')
    await expect(totalTracked).not.toContainText('VND')
  })

  test('preserves Cost Source overview on /costs/sources', async ({ page }) => {
    await page.route('**/api/companies/**/cost-sources', async (route) => {
      await route.fulfill({
        json: {
          projects: [{ project: { id: projectIdAlpha, code: 'P-1', name: 'Dự án nguồn mẫu' }, engagements: [], sourceCount: 2, figureCount: 3, latestObservedAt: '2026-09-14T00:00:00.000Z', openIssueCount: 1, mappingState: 'pending' }],
          unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: null },
          sourceCount: 2,
          figureCount: 3,
          openIssueCount: 1,
        },
      })
    })

    await page.goto('/costs/sources')
    await expect(page.getByRole('heading', { level: 1, name: 'Dữ liệu nguồn chi phí' })).toBeVisible()
    await expect(page.getByText('Dự án nguồn mẫu')).toBeVisible()
    await expect(page.getByRole('link', { name: /Dự án nguồn mẫu/i })).toHaveAttribute('href', `/costs/projects/${projectIdAlpha}`)
  })

  test('Cost Source detail has back link returning to /costs/sources', async ({ page }) => {
    await page.route('**/api/companies/**/cost-sources/projects/**', async (route) => {
      await route.fulfill({
        json: {
          project: { id: projectIdAlpha, code: 'P-1', name: 'Dự án nguồn mẫu' },
          engagements: [],
        },
      })
    })
    await page.route('**/api/companies/**/cost-sources/projects/**/figures**', async (route) => {
      await route.fulfill({ json: { items: [], nextCursor: null } })
    })

    await page.goto(`/costs/projects/${projectIdAlpha}`)
    const backLink = page.getByRole('link', { name: /Dữ liệu nguồn chi phí/i })
    await expect(backLink).toHaveAttribute('href', '/costs/sources')
  })

  test('handles company switching and cancels stale in-flight response', async ({ page, authState }) => {
    const company1Id = '10000000-0000-4000-8000-000000000002'
    const company2Id = '10000000-0000-4000-8000-000000000003'

    authState.sessionCompanies = [
      createCompany({ companyId: company1Id, companyName: 'Công ty Alpha' }),
      createCompany({ companyId: company2Id, companyName: 'Công ty Beta' }),
    ]

    let resolveCompany1: ((value: unknown) => void) | null = null

    await page.route(`**/api/companies/${company1Id}/project-costs`, async (route) => {
      await new Promise(resolve => { resolveCompany1 = resolve })
      await route.fulfill({ json: mockSummaries })
    })

    await page.route(`**/api/companies/${company2Id}/project-costs`, async (route) => {
      await route.fulfill({
        json: [
          {
            projectId: projectIdBeta,
            projectCode: 'BETA-1',
            projectName: 'Project for Company Beta Only',
            summary: mockSummaries[1].summary,
          },
        ],
      })
    })

    await page.goto('/costs')
    // While company 1 is pending, switch to company 2
    const companySelect = page.getByLabel('Chuyển công ty')
    await companySelect.selectOption(company2Id)
    await expect(page).toHaveURL(/\/projects$/)
    resolveCompany1?.(null)

    await page.goto('/costs')
    await expect(page.getByText('Project for Company Beta Only')).toBeVisible()
    await expect(page.getByText('Synthetic Project Alpha')).toHaveCount(0)
  })

  test('renders error, permission, and empty states gracefully', async ({ page }) => {
    // Empty state
    await page.route('**/api/companies/**/project-costs', async (route) => {
      await route.fulfill({ json: [] })
    })
    await page.goto('/costs')
    await expect(page.getByText('Chưa có chi phí dự án')).toBeVisible()

    // Error / retry state
    await page.route('**/api/companies/**/project-costs', async (route) => {
      await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống' } })
    })
    await page.reload()
    await expect(page.getByText('Không thể tải dữ liệu')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  })

  test('detail handles 404 RESOURCE_NOT_FOUND gracefully', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Không tìm thấy chi phí dự án',
            requestId: '10000000-0000-4000-8000-000000000999',
            details: {},
          },
        }),
      })
    })
    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByText('Không tìm thấy dữ liệu chi phí dự án')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quay lại danh sách chi phí dự án' })).toBeVisible()
  })

  test('responsive and accessibility checks on desktop and mobile', async ({ page }) => {
    await page.route('**/api/companies/**/project-costs', async (route) => {
      await route.fulfill({ json: mockSummaries })
    })
    await page.route(`**/api/companies/**/projects/${projectIdBeta}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownBeta })
    })

    // Desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/costs')
    await expect(page.getByRole('heading', { level: 1, name: 'Chi phí dự án' })).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-overview-1440.png', fullPage: true })
    let violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Mobile 390
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/gate-g-overview-390.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Detail desktop 1440
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/costs/${projectIdBeta}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-detail-1440.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Detail mobile 390
    await page.setViewportSize({ width: 390, height: 844 })
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/gate-g-detail-390.png', fullPage: true })
    violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])

    // Sources sanity screenshot
    await page.route('**/api/companies/**/cost-sources', async (route) => {
      await route.fulfill({
        json: {
          projects: [{ project: { id: projectIdAlpha, code: 'P-1', name: 'Dự án nguồn mẫu' }, engagements: [], sourceCount: 2, figureCount: 3, latestObservedAt: '2026-09-14T00:00:00.000Z', openIssueCount: 1, mappingState: 'pending' }],
          unassigned: { sourceCount: 0, figureCount: 0, latestObservedAt: null },
          sourceCount: 2,
          figureCount: 3,
          openIssueCount: 1,
        },
      })
    })
    await page.goto('/costs/sources')
    await expect(page.getByRole('heading', { level: 1, name: 'Dữ liệu nguồn chi phí' })).toBeVisible()
    await page.screenshot({ path: 'test-results/gate-g-sources-sanity.png', fullPage: true })
  })

  test('lazy-loads details only after expansion, caches result, and avoids double counting parent total', async ({ page }) => {
    let item1FetchCount = 0

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.route(`**/api/companies/**/project-costs/${item1Id}/details`, async (route) => {
      item1FetchCount++
      await route.fulfill({ json: mockItem1Details })
    })

    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Alpha')

    // Initial load: 0 detail calls
    expect(item1FetchCount).toBe(0)
    await expect(page.locator(`[data-testid="details-row-${item1Id}"]`)).toHaveCount(0)

    // Expand item 1
    const toggleBtn = page.locator(`[data-testid="toggle-details-${item1Id}"]`)
    await toggleBtn.click()

    // 1 detail call made
    expect(item1FetchCount).toBe(1)
    const nestedRow = page.locator(`[data-testid="details-row-${item1Id}"]`)
    await expect(nestedRow).toBeVisible()
    const desktopTable = nestedRow.locator('.nested-table')

    // Opening balance line: badge "Số liệu ban đầu"
    await expect(desktopTable.getByText('Số liệu ban đầu')).toBeVisible()
    await expect(desktopTable.getByText('Số dư đầu kỳ cọc khoan nhồi')).toBeVisible()
    await expect(desktopTable.getByText('OB-01')).toBeVisible()
    await expect(desktopTable.getByText('Chuyển giao từ kỳ trước')).toBeVisible()

    // Line item
    await expect(desktopTable.getByText('Khoan cọc thí nghiệm D800')).toBeVisible()
    await expect(desktopTable.getByText('70,000,000 VND')).toBeVisible()
    await expect(desktopTable.getByText('35,000,000')).toBeVisible()
    await expect(desktopTable.getByText('15/08/2026')).toBeVisible()
    await expect(desktopTable.getByText('BB-01')).toBeVisible()

    // Invariant: No double counting in project summary
    await expect(page.getByTestId('detail-total-tracked')).toContainText('242,562,376')
    await expect(page.getByTestId('detail-accepted')).toContainText('242,562,376')

    // Collapse item 1
    await toggleBtn.click()
    await expect(page.locator(`[data-testid="details-row-${item1Id}"]`)).toHaveCount(0)

    // Re-expand item 1: should use session cache and NOT make a second request
    await toggleBtn.click()
    await expect(page.locator(`[data-testid="details-row-${item1Id}"]`)).toBeVisible()
    expect(item1FetchCount).toBe(1)
  })

  test('maintains independent detail state between different parent rows', async ({ page }) => {
    let item1FetchCount = 0
    let item2FetchCount = 0

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.route(`**/api/companies/**/project-costs/${item1Id}/details`, async (route) => {
      item1FetchCount++
      await route.fulfill({ json: mockItem1Details })
    })

    await page.route(`**/api/companies/**/project-costs/${item2Id}/details`, async (route) => {
      item2FetchCount++
      await route.fulfill({ json: mockItem2Details })
    })

    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Alpha')

    // Expand item 1
    await page.locator(`[data-testid="toggle-details-${item1Id}"]`).click()
    const item1Row = page.locator(`[data-testid="details-row-${item1Id}"]`)
    await expect(item1Row).toBeVisible()
    await expect(item1Row.locator('.nested-table').getByText('Khoan cọc thí nghiệm D800')).toBeVisible()
    await expect(page.locator(`[data-testid="details-row-${item2Id}"]`)).toHaveCount(0)
    expect(item1FetchCount).toBe(1)
    expect(item2FetchCount).toBe(0)

    // Expand item 2
    await page.locator(`[data-testid="toggle-details-${item2Id}"]`).click()
    const item2Row = page.locator(`[data-testid="details-row-${item2Id}"]`)
    await expect(item1Row).toBeVisible()
    await expect(item2Row).toBeVisible()
    await expect(item2Row.locator('.nested-table').getByText('Thép CB400 d20 đài móng')).toBeVisible()
    expect(item1FetchCount).toBe(1)
    expect(item2FetchCount).toBe(1)

    // Check item 2 content
    await expect(item2Row.locator('.nested-table').getByText('122,562,376 VND')).toBeVisible()
  })

  test('detail request error does not break project page and allows retry', async ({ page }) => {
    let attempt = 0

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.route(`**/api/companies/**/project-costs/${item3Id}/details`, async (route) => {
      attempt++
      if (attempt === 1) {
        await route.fulfill({ status: 500, json: { message: 'Internal error' } })
      }
      else {
        await route.fulfill({ json: mockItem3Details })
      }
    })

    await page.goto(`/costs/${projectIdAlpha}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Synthetic Project Alpha')

    // Expand item 3
    await page.locator(`[data-testid="toggle-details-${item3Id}"]`).click()

    // Error message and retry button appear in item 3 detail area
    const errorRow = page.locator(`[data-testid="details-row-${item3Id}"]`)
    await expect(errorRow).toBeVisible()
    await expect(errorRow.getByText('Không thể tải chi tiết hạng mục.')).toBeVisible()
    const retryBtn = page.locator(`[data-testid="retry-details-${item3Id}"]`)
    await expect(retryBtn).toBeVisible()

    // The rest of the page remains fully functional
    await expect(page.getByTestId('detail-total-tracked')).toContainText('242,562,376')
    await expect(page.getByText('Thi công cọc khoan nhồi D800')).toBeVisible()

    // Click retry
    await retryBtn.click()

    // Item 3 details load successfully
    const desktopTable = errorRow.locator('.nested-table')
    await expect(desktopTable.getByText('Chi phí khoan mẫu địa chất')).toBeVisible()
    await expect(desktopTable.getByText('15,000,000 VND')).toBeVisible()
  })

  test('mobile viewport renders compact stacked detail cards without horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.route(`**/api/companies/**/project-costs/${item1Id}/details`, async (route) => {
      await route.fulfill({ json: mockItem1Details })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Expand item 1
    const toggleBtn = page.locator(`[data-testid="toggle-details-${item1Id}"]`)
    await toggleBtn.click()

    const nestedRow = page.locator(`[data-testid="details-row-${item1Id}"]`)
    await expect(nestedRow).toBeVisible()

    // Mobile stacked cards are visible, desktop nested table container is hidden
    const mobileCards = nestedRow.locator('.nested-mobile-cards')
    await expect(mobileCards).toBeVisible()
    const desktopTable = nestedRow.locator('.nested-table-container')
    await expect(desktopTable).toBeHidden()

    // Check card content
    await expect(mobileCards.getByText('Số liệu ban đầu')).toBeVisible()
    await expect(mobileCards.getByText('Số dư đầu kỳ cọc khoan nhồi')).toBeVisible()
    await expect(mobileCards.getByText('Khoan cọc thí nghiệm D800')).toBeVisible()

    // Tap target size >= 44px
    const toggleBox = await toggleBtn.boundingBox()
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44)

    // No horizontal overflow
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)

    // Accessibility check on expanded mobile view
    const violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])
  })

  test('desktop UI renders structured warranty retention for Yong Mei subcontract cost without altering parent totals', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdYongMei}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownYongMei })
    })

    await page.route(`**/api/companies/**/project-costs/${yongMeiItemId}/details`, async (route) => {
      await route.fulfill({ json: mockYongMeiDetails })
    })

    await page.goto(`/costs/${projectIdYongMei}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dự án kết cấu thép Yong Mei')

    // Invariant: Parent / project summary totals remain 107,530,000 VND, NOT altered by retention
    await expect(page.getByTestId('detail-total-tracked')).toContainText('107,530,000')
    await expect(page.getByTestId('detail-in-progress')).toContainText('107,530,000')

    // Expand Yong Mei item
    const toggleBtn = page.locator(`[data-testid="toggle-details-${yongMeiItemId}"]`)
    await toggleBtn.click()

    const nestedRow = page.locator(`[data-testid="details-row-${yongMeiItemId}"]`)
    await expect(nestedRow).toBeVisible()

    // Compact retention summary banner shows derived total 5,376,500 VND
    const retentionBanner = nestedRow.locator('[data-testid="retention-summary-banner"]')
    await expect(retentionBanner).toBeVisible()
    await expect(retentionBanner.getByText('Giữ lại bảo hành:')).toBeVisible()
    await expect(retentionBanner.getByText('5,376,500 VND')).toBeVisible()

    // Desktop table lines
    const desktopTable = nestedRow.locator('.nested-table')
    await expect(desktopTable).toBeVisible()

    // Line 1: primary recognized amount 31,200,000 VND and retention 1,560,000 VND
    await expect(desktopTable.getByText('Gia công lắp dựng kết cấu thép Yong Mei đợt 1')).toBeVisible()
    await expect(desktopTable.getByText('31,200,000 VND')).toBeVisible()
    await expect(desktopTable.getByText('Giữ lại bảo hành 5%')).toHaveCount(2)
    await expect(desktopTable.getByText('1,560,000 VND')).toBeVisible()

    // Line 2: primary recognized amount 76,330,000 VND and retention 3,816,500 VND
    await expect(desktopTable.getByText('Gia công lắp dựng kết cấu thép Yong Mei đợt 2')).toBeVisible()
    await expect(desktopTable.getByText('76,330,000 VND')).toBeVisible()
    await expect(desktopTable.getByText('3,816,500 VND')).toBeVisible()

    // Invariant: 102,153,500 is NOT labeled as paid / advance / payment
    const pageContent = await page.content()
    expect(pageContent).not.toMatch(/102[,.]?153[,.]?500.*(paid|advance|payment|thanh toán|tạm ứng)/i)
    expect(pageContent).not.toMatch(/(paid|advance|payment|thanh toán|tạm ứng).*102[,.]?153[,.]?500/i)

    // Invariant: Parent recognized amount on item row remains 107,530,000 VND
    const parentRow = page.locator(`[data-testid="cost-item-row-${yongMeiItemId}"]`)
    await expect(parentRow.locator('.col-amount')).toContainText('107,530,000 VND')

    // Accessibility check on desktop view
    const violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])
  })

  test('mobile viewport renders structured warranty retention without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.route(`**/api/companies/**/projects/${projectIdYongMei}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownYongMei })
    })

    await page.route(`**/api/companies/**/project-costs/${yongMeiItemId}/details`, async (route) => {
      await route.fulfill({ json: mockYongMeiDetails })
    })

    await page.goto(`/costs/${projectIdYongMei}`)

    // Expand Yong Mei item
    const toggleBtn = page.locator(`[data-testid="toggle-details-${yongMeiItemId}"]`)
    await toggleBtn.click()

    const nestedRow = page.locator(`[data-testid="details-row-${yongMeiItemId}"]`)
    await expect(nestedRow).toBeVisible()

    // Mobile stacked cards are visible, desktop nested table is hidden
    const mobileCards = nestedRow.locator('.nested-mobile-cards')
    await expect(mobileCards).toBeVisible()
    await expect(nestedRow.locator('.nested-table-container')).toBeHidden()

    // Compact retention summary banner is visible on mobile
    const retentionBanner = nestedRow.locator('[data-testid="retention-summary-banner"]')
    await expect(retentionBanner).toBeVisible()
    await expect(retentionBanner.getByText('Giữ lại bảo hành:')).toBeVisible()
    await expect(retentionBanner.getByText('5,376,500 VND')).toBeVisible()

    // Check card 1 retention
    await expect(mobileCards.getByText('Gia công lắp dựng kết cấu thép Yong Mei đợt 1')).toBeVisible()
    await expect(mobileCards.getByText('31,200,000 VND')).toBeVisible()
    await expect(mobileCards.getByText('1,560,000 VND')).toBeVisible()

    // Check card 2 retention
    await expect(mobileCards.getByText('Gia công lắp dựng kết cấu thép Yong Mei đợt 2')).toBeVisible()
    await expect(mobileCards.getByText('76,330,000 VND')).toBeVisible()
    await expect(mobileCards.getByText('3,816,500 VND')).toBeVisible()

    // Tap target size >= 44px
    const toggleBox = await toggleBtn.boundingBox()
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44)

    // No horizontal overflow at 390px
    await expect.poll(() => page.locator('body').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true)

    // Accessibility check on mobile view
    const violations = (await new AxeBuilder({ page }).include('main').analyze()).violations
    expect(violations).toEqual([])
  })

  test('details without retention do not render an empty retention section or summary banner', async ({ page }) => {
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
    })

    await page.route(`**/api/companies/**/project-costs/${item1Id}/details`, async (route) => {
      await route.fulfill({ json: mockItem1Details })
    })

    await page.goto(`/costs/${projectIdAlpha}`)

    // Expand item 1 (no retention)
    await page.locator(`[data-testid="toggle-details-${item1Id}"]`).click()

    const nestedRow = page.locator(`[data-testid="details-row-${item1Id}"]`)
    await expect(nestedRow).toBeVisible()

    // No retention summary banner rendered
    await expect(nestedRow.locator('[data-testid="retention-summary-banner"]')).toHaveCount(0)

    // No detail retention sublines rendered
    await expect(nestedRow.locator('[data-testid="detail-retention-subline"]')).toHaveCount(0)
    await expect(nestedRow.locator('[data-testid="mobile-retention-subline"]')).toHaveCount(0)

    // Text "Giữ lại bảo hành" does not appear
    await expect(nestedRow.getByText('Giữ lại bảo hành')).toHaveCount(0)
  })
})
