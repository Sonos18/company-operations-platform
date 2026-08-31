import type { Page } from '@playwright/test'
import { createCompany } from './fixtures/auth-routes'
import { expect, test } from './fixtures/authenticated'
import {
  createOpportunityInputSchema,
  createStage01OpportunityResultSchema,
  opportunitySummarySchema,
  type OpportunitySummary,
} from '../../shared/schemas/opportunities'
import { opportunityCreateOptionsSchema, type OpportunityCreateOptions } from '../../shared/schemas/opportunity-create-options'

const opportunityId = '80000000-0000-4000-8000-000000000001'
const timestamp = '2026-08-31T00:00:00.000Z'

function opportunity(overrides: Partial<OpportunitySummary> = {}): OpportunitySummary {
  return opportunitySummarySchema.parse({
    id: opportunityId,
    validityState: 'valid',
    canonicalOpportunityId: null,
    primaryCustomerName: 'Công ty Việt Quốc Huy',
    needDescription: 'Thiết kế văn phòng mới',
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  })
}

async function installOpportunityListRoute(
  page: Page,
  response: OpportunitySummary[] | 500,
): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/opportunities$/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (response === 500) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử', requestId: 'opportunity-list-error', details: {} } }) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
  })
}

async function goToOpportunities(page: Page): Promise<void> {
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('link', { name: 'Cơ hội', exact: true }).click()
  await expect(page).toHaveURL(/\/opportunities$/)
}

function createOptions(): OpportunityCreateOptions {
  return opportunityCreateOptionsSchema.parse({
    workflowKey: 'vqh.stage01',
    publishedSnapshotId: '80000000-0000-4000-8000-000000000050',
    taxonomies: {
      customer_type: [{ code: 'customer', label: 'Khách hàng' }],
      lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: true } }],
      engagement_status: [{ code: 'active', label: 'Đang trao đổi' }],
      budget_status: [{ code: 'unknown', label: 'Chưa xác định' }],
      timeline_status: [{ code: 'unknown', label: 'Chưa xác định' }],
      priority: [{ code: 'normal', label: 'Bình thường' }],
    },
  })
}

async function installCreateOptionsRoute(page: Page, responses: Array<OpportunityCreateOptions | 500>): Promise<void> {
  await page.route(/\/api\/companies\/[^/]+\/opportunities\/create-options$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = responses.shift() ?? 500
    if (response === 500) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử', requestId: 'create-options-error', details: {} } }) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) })
  })
}

test('gates the opportunity navigation and route on opportunity.read only', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'opportunity.create'] })]

  await page.goto('/projects')
  await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Cơ hội', exact: true })).toHaveCount(0)

  await page.goto('/opportunities')
  await expect(page).toHaveURL(/\/forbidden$/)
})

test('loads opportunity summaries and exposes a keyboard-accessible create action', async ({ page }) => {
  await installOpportunityListRoute(page, [opportunity()])

  await goToOpportunities(page)

  await expect(page.getByRole('heading', { name: 'Cơ hội', exact: true })).toBeVisible()
  const opportunityTable = page.getByTestId('opportunity-list').getByRole('table', { name: 'Danh sách cơ hội' })
  await expect(opportunityTable.getByText('Công ty Việt Quốc Huy', { exact: true })).toBeVisible()
  await expect(opportunityTable.getByText('Thiết kế văn phòng mới', { exact: true })).toBeVisible()
  const create = page.getByRole('button', { name: 'Tạo cơ hội mới' })
  await expect(create).toBeVisible()
  await create.focus()
})

test('does not expose the create action to an opportunity reader without create permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'opportunity.read'] })]
  await installOpportunityListRoute(page, [])
  await goToOpportunities(page)
  await expect(page.getByRole('button', { name: 'Tạo cơ hội mới' })).toHaveCount(0)
})

test('shows create-options loading before a pending options response completes', async ({ page }) => {
  let resolvePendingResponse: (() => void) | undefined
  const pendingResponse = new Promise<void>(resolve => { resolvePendingResponse = resolve })
  let resolveRequestObserved: (() => void) | undefined
  const requestObserved = new Promise<void>(resolve => { resolveRequestObserved = resolve })

  await installOpportunityListRoute(page, [])
  await page.route(/\/api\/companies\/[^/]+\/opportunities\/create-options$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    resolveRequestObserved?.()
    await pendingResponse
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(createOptions()) })
  })
  await goToOpportunities(page)

  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  await requestObserved
  const dialog = page.getByRole('dialog', { name: 'Tạo cơ hội mới' })
  await expect(dialog.getByLabel('Đang tải cấu hình tạo cơ hội')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Tên khách hàng chính' })).toHaveCount(0)

  resolvePendingResponse?.()
  await expect(dialog.getByRole('textbox', { name: 'Tên khách hàng chính' })).toBeVisible()
})

test('keeps the list usable and preserves form values when create-options loading fails after a prior success', async ({ page }) => {
  await installOpportunityListRoute(page, [opportunity()])
  await installCreateOptionsRoute(page, [createOptions(), 500])
  await goToOpportunities(page)

  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tạo cơ hội mới' })
  const customerName = dialog.getByRole('textbox', { name: 'Tên khách hàng chính' })
  await customerName.fill('Khách hàng cần giữ lại')
  await dialog.getByRole('button', { name: 'Hủy' }).click()
  await expect(page.getByTestId('opportunity-list')).toBeVisible()

  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: 'Không thể làm mới tùy chọn tạo cơ hội' })).toBeVisible()
  await expect(customerName).toHaveValue('Khách hàng cần giữ lại')
  await expect(page.getByTestId('opportunity-list')).toBeVisible()
})

test('shows an empty state and a retryable list error', async ({ page }) => {
  await installOpportunityListRoute(page, [])
  await goToOpportunities(page)
  await expect(page.getByText('Chưa có cơ hội', { exact: true })).toBeVisible()

  await installOpportunityListRoute(page, 500)
  await page.goto('/projects')
  await page.getByTestId('app-sidebar').getByRole('link', { name: 'Cơ hội', exact: true }).click()
  const listError = page.getByRole('alert').filter({ hasText: 'Không thể tải danh sách cơ hội' })
  await expect(listError).toBeVisible()
  await expect(listError.getByRole('button', { name: 'Thử lại' })).toBeVisible()
})

test('loads narrow create options for a new opportunity and navigates after create', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'opportunity.read', 'opportunity.create'] })]
  const requests: Array<{ method: string, body: unknown }> = []
  await installOpportunityListRoute(page, [])
  await installCreateOptionsRoute(page, [createOptions()])
  await page.route(/\/api\/companies\/[^/]+\/opportunities$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    const input = createOpportunityInputSchema.parse(route.request().postDataJSON())
    requests.push({ method: 'POST', body: input })
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(createStage01OpportunityResultSchema.parse({
        opportunityId,
        workflowInstanceId: '80000000-0000-4000-8000-000000000002',
        intakeNodeInstanceId: '80000000-0000-4000-8000-000000000003',
        intakeExecutionId: '80000000-0000-4000-8000-000000000004',
        evaluationNodeInstanceId: '80000000-0000-4000-8000-000000000005',
        evaluationExecutionId: '80000000-0000-4000-8000-000000000006',
        decisionCycleId: '80000000-0000-4000-8000-000000000007',
        opportunityVersion: 0,
        intakeExecutionVersion: 0,
        evaluationExecutionVersion: 0,
        decisionCycleVersion: 0,
      })),
    })
  })

  await goToOpportunities(page)
  await expect(page.getByRole('button', { name: 'Tạo cơ hội mới' })).toBeVisible()

  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tạo cơ hội mới' })
  await expect(dialog.getByRole('textbox', { name: 'Tên khách hàng chính' })).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Tên khách hàng chính' }).fill('Khách hàng mới')
  await dialog.getByRole('combobox', { name: 'Loại khách hàng' }).selectOption('customer')
  await dialog.getByRole('combobox', { name: 'Nguồn khách hàng' }).selectOption('referral')
  await dialog.getByRole('combobox', { name: 'Mức độ ưu tiên' }).selectOption('normal')
  await dialog.getByRole('button', { name: 'Tạo cơ hội' }).click()

  await expect(page).toHaveURL(new RegExp(`/opportunities/${opportunityId}/stage-01$`))
  expect(requests).toEqual([{
    method: 'POST',
    body: expect.objectContaining({
      primaryCustomerName: 'Khách hàng mới',
      customerTypeCode: 'customer',
      primaryLeadSourceCode: 'referral',
      priorityCode: 'normal',
    }),
  }])
})
