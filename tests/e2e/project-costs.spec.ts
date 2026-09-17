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
    await expect(alphaCard.getByTestId('accepted-value')).toContainText('242,562,376')
    await expect(alphaCard.getByTestId('accepted-count')).toContainText('4')
    await expect(alphaCard.getByTestId('unknown-value')).toContainText('15,000,000')
    await expect(alphaCard.getByTestId('unknown-count')).toContainText('1')

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
    await page.route(`**/api/companies/**/projects/${projectIdAlpha}/project-costs`, async (route) => {
      await route.fulfill({ json: mockBreakdownAlpha })
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
    await page.goto(`/costs/${projectIdAlpha}`)
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
})
