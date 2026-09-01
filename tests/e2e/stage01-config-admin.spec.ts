import { createCompany } from './fixtures/auth-routes'
import { expect, test, type Page } from './fixtures/authenticated'
import {
  createStage01ConfigView,
  installStage01ConfigRoutes,
  type Stage01ConfigRouteState,
} from './fixtures/stage01-config'

function configState(): Stage01ConfigRouteState {
  return {
    view: createStage01ConfigView(),
    requests: [],
    nextFailure: null,
    initialConfigUnavailable: false,
  }
}

function customerTypeLabelInput(page: Page) {
  return page.locator('.taxonomy-group')
    .filter({ has: page.getByRole('heading', { name: 'Loại khách hàng', exact: true }) })
    .locator('input').first()
}

test('creates a version-zero draft from the visible published snapshot', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  await installStage01ConfigRoutes(page, state)

  await page.goto('/settings/stage-01')

  await expect(page.getByRole('heading', { name: 'Cấu hình Stage 01' })).toBeVisible()
  await expect(page.getByText('Mẫu v1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  await expect(page.getByText('Có bản nháp chưa xuất bản', { exact: true })).toBeVisible()
  await expect(page.getByText('v0', { exact: true })).toBeVisible()
  expect(state.requests).toEqual([
    { method: 'GET', path: '/api/companies/10000000-0000-4000-8000-000000000002/stage-01/config', body: undefined },
    {
      method: 'POST',
      path: '/api/companies/10000000-0000-4000-8000-000000000002/stage-01/config/draft',
      body: { expectedPublishedSnapshotId: '70000000-0000-4000-8000-000000000010' },
    },
  ])
})

test('gates the header link and direct route on stage01.config.read', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read'] })]
  const state = configState()
  await installStage01ConfigRoutes(page, state)

  await page.goto('/projects')
  await expect(page.getByTestId('app-header').getByRole('link', { name: 'Cấu hình', exact: true })).toHaveCount(0)

  await page.goto('/settings/stage-01')
  await expect(page).toHaveURL(/\/forbidden$/)
  expect(state.requests).toEqual([])
})

test('renders a no-draft published configuration read-only for a read-only administrator', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['stage01.config.read'] })]
  const state = configState()
  await installStage01ConfigRoutes(page, state)

  await page.goto('/settings/stage-01')

  const customerType = page.locator('.taxonomy-group').filter({ has: page.getByRole('heading', { name: 'Loại khách hàng', exact: true }) })
  await expect(customerType.getByText('Khách hàng', { exact: true })).toBeVisible()
  const firstCriterion = page.locator('.criterion-card').first()
  await expect(firstCriterion.locator('code').filter({ hasText: 'customer_need' })).toBeVisible()
  await expect(page.locator('.taxonomy-editor input')).toHaveCount(0)
  await expect(page.locator('.criteria-editor input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Thêm giá trị/u })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm tiêu chí' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Xóa/u })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lưu bản nháp' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hủy bản nháp' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xuất bản', exact: true })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Thao tác bản nháp' })).toHaveCount(0)
})

test('keeps a no-draft configuration read-only until an updater creates the draft', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['stage01.config.read', 'stage01.config.update'] })]
  const state = configState()
  await installStage01ConfigRoutes(page, state)

  await page.goto('/settings/stage-01')

  const customerType = page.locator('.taxonomy-group').filter({ has: page.getByRole('heading', { name: 'Loại khách hàng', exact: true }) })
  await expect(customerType.getByText('Khách hàng', { exact: true })).toBeVisible()
  await expect(page.locator('.criteria-editor').first().locator('.criterion-card').first().locator('code').filter({ hasText: 'customer_need' })).toBeVisible()
  await expect(page.locator('.taxonomy-editor input')).toHaveCount(0)
  await expect(page.locator('.criteria-editor input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  await expect(customerType.getByRole('textbox', { name: 'Nhãn Loại khách hàng: Khách hàng' })).toBeEditable()
  await expect(page.locator('.criterion-card').first().getByRole('textbox', { name: 'Nhãn hiển thị' })).toBeEditable()
  await expect(page.getByRole('complementary', { name: 'Thao tác bản nháp' })).toBeVisible()
})

test('resumes an existing draft as a publisher without update permission', async ({ page, authState }) => {
  const state = configState()
  authState.sessionCompanies = [createCompany()]
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  authState.sessionCompanies = [createCompany({
    permissions: ['stage01.config.read', 'stage01.config.publish'],
  })]
  await page.reload()

  await expect(page.getByText('Có bản nháp chưa xuất bản', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lưu bản nháp' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Hủy bản nháp' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Xuất bản', exact: true })).toBeEnabled()
  await expect(page.locator('.taxonomy-editor input')).toHaveCount(0)
  await expect(page.locator('.criteria-editor input')).toHaveCount(0)
})

test('renders only the approved editable business fields and stable published identifiers', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  const taxonomy = page.locator('.taxonomy-group').filter({ has: page.getByRole('heading', { name: 'Loại khách hàng' }) })
  await expect(taxonomy.getByRole('textbox', { name: 'Nhãn Loại khách hàng: Khách hàng' })).toBeEditable()
  await expect(taxonomy.getByRole('textbox', { name: 'Mã Loại khách hàng: Khách hàng' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Yêu cầu người giới thiệu' })).toBeChecked()

  const firstCriterion = page.locator('.criterion-card').first()
  await expect(firstCriterion.getByText('Mã kỹ thuật', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Nhóm đánh giá', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Nhãn hiển thị', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Mô tả', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Mức độ quan trọng', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Cách xác định áp dụng', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByText('Thứ tự hiển thị', { exact: true })).toBeVisible()
  await expect(firstCriterion.getByRole('checkbox', { name: 'Cho phép không áp dụng' })).toBeVisible()
  await expect(firstCriterion.locator('input').first()).toBeDisabled()
  await expect(page.getByText('semanticKey', { exact: true })).toHaveCount(0)
  await expect(page.getByText('JSON', { exact: true })).toHaveCount(0)
})

test('saves exactly one versioned draft update and resets local changes without a request', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  const label = customerTypeLabelInput(page)
  await label.fill('Khách doanh nghiệp')
  await page.getByRole('checkbox', { name: 'Yêu cầu người giới thiệu' }).uncheck()
  const firstCriterion = page.locator('.criterion-card').first()
  await firstCriterion.getByRole('textbox', { name: 'Nhãn hiển thị' }).fill('Nhu cầu đã cập nhật')
  await firstCriterion.getByRole('textbox', { name: 'Mô tả' }).fill('Mô tả đã cập nhật.')
  await firstCriterion.getByRole('combobox', { name: 'Nhóm đánh giá' }).click()
  await page.getByRole('option', { name: 'Khả năng đáp ứng phạm vi', exact: true }).click()
  const secondCriterion = page.locator('.criterion-card').nth(1)
  await secondCriterion.getByRole('combobox', { name: 'Nhóm đánh giá' }).click()
  await page.getByRole('option', { name: 'Nhu cầu khách hàng', exact: true }).click()
  await firstCriterion.getByRole('combobox', { name: 'Mức độ quan trọng' }).click()
  await page.getByRole('option', { name: 'Tùy chọn', exact: true }).click()
  await firstCriterion.getByRole('combobox', { name: 'Cách xác định áp dụng' }).click()
  await page.getByRole('option', { name: 'Xác định thủ công', exact: true }).click()
  await firstCriterion.getByRole('checkbox', { name: 'Cho phép không áp dụng' }).check()
  await firstCriterion.getByRole('spinbutton', { name: 'Thứ tự hiển thị' }).fill('9')
  await expect(page.locator('.config-action-bar').getByRole('status')).toContainText('Có thay đổi chưa lưu')
  await expect(page.getByRole('button', { name: 'Xuất bản' })).toBeDisabled()
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()

  await expect(page.getByText('Đã lưu bản nháp.', { exact: true })).toBeVisible()
  await expect(page.getByText('v1', { exact: true })).toBeVisible()
  const update = state.requests.find(request => request.method === 'PUT')
  expect(update?.body).toEqual(expect.objectContaining({
    expectedDraftVersion: 0,
    taxonomies: expect.objectContaining({
      customer_type: [{ code: 'customer', label: 'Khách doanh nghiệp' }],
      lead_source: [{ code: 'referral', label: 'Giới thiệu', behavior: { requiresReferrer: false } }],
    }),
    criteria: expect.arrayContaining([expect.objectContaining({
      key: 'customer_need',
      dimensionKey: 'scope_capability',
      label: 'Nhu cầu đã cập nhật',
      description: 'Mô tả đã cập nhật.',
      criticality: 'optional',
      applicabilityMode: 'manual',
      allowsNotApplicable: true,
      displayOrder: 9,
    })]),
  }))

  await label.fill('Khách dự phòng')
  const requestsBeforeReset = state.requests.length
  await page.getByRole('button', { name: 'Hủy thay đổi chưa lưu' }).click()
  await expect(label).toHaveValue('Khách doanh nghiệp')
  expect(state.requests).toHaveLength(requestsBeforeReset)
})

test('cancels and confirms discard, then publishes the canonical next immutable template', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  const originalPublished = structuredClone(state.view.published)
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  await page.getByRole('button', { name: 'Hủy bản nháp' }).click()
  await expect(page.getByRole('dialog', { name: 'Hủy bản nháp?' })).toBeVisible()
  await page.getByRole('button', { name: 'Quay lại' }).click()
  await expect(page.getByRole('dialog', { name: 'Hủy bản nháp?' })).toHaveCount(0)
  await expect(page.getByText('Có bản nháp chưa xuất bản', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Hủy bản nháp' }).click()
  await page.getByRole('dialog', { name: 'Hủy bản nháp?' }).getByRole('button', { name: 'Hủy bản nháp' }).click()
  await expect(page.getByText('Chưa có bản nháp', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()
  await customerTypeLabelInput(page).fill('Khách sau xuất bản')
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Xuất bản cấu hình?' })).toBeVisible()
  await page.getByRole('button', { name: 'Quay lại' }).click()
  await expect(page.getByText('Có bản nháp chưa xuất bản', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click()
  await page.getByRole('dialog', { name: 'Xuất bản cấu hình?' }).getByRole('button', { name: 'Xuất bản' }).click()
  await expect(page.getByText('Đã xuất bản mẫu cấu hình v2.', { exact: true })).toBeVisible()
  await expect(page.getByText('Mẫu v2', { exact: true })).toBeVisible()
  await expect(page.getByText('Chưa có bản nháp', { exact: true })).toBeVisible()
  expect(state.view.published.taxonomies.customer_type).toEqual([{ code: 'customer', label: 'Khách sau xuất bản' }])
  expect(originalPublished.taxonomies.customer_type).toEqual([{ code: 'customer', label: 'Khách hàng' }])
  expect(state.requests.slice(-2).map(request => request.method)).toEqual(['POST', 'GET'])
})

test('preserves local input after conflict, supports safe canonical reload, and surfaces rejected mutations', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()
  const label = customerTypeLabelInput(page)

  await label.fill('Giữ lại 409')
  state.nextFailure = 409
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
  await expect(page.getByRole('alert')).toContainText('Cấu hình đã thay đổi')
  await expect(label).toHaveValue('Giữ lại 409')
  const reload = page.getByRole('button', { name: 'Tải lại cấu hình' })
  await expect(reload).toBeVisible()
  state.view = {
    ...state.view,
    draft: { ...state.view.draft!, taxonomies: { ...state.view.draft!.taxonomies, customer_type: [{ code: 'customer', label: 'Bản chính tắc' }] } },
  }
  page.once('dialog', dialog => dialog.dismiss())
  await reload.click()
  await expect(label).toHaveValue('Giữ lại 409')

  page.once('dialog', dialog => dialog.accept())
  await reload.click()
  await expect(label).toHaveValue('Bản chính tắc')
  expect(state.requests.filter(request => request.method === 'GET')).toHaveLength(2)

  for (const [failure, title] of [[500, 'Không thể cập nhật cấu hình Stage 01'], [403, 'Bạn không còn quyền thực hiện thao tác này']] as const) {
    await label.fill(`Giữ lại ${failure}`)
    state.nextFailure = failure
    await page.getByRole('button', { name: 'Lưu bản nháp' }).click()
    await expect(page.getByRole('alert')).toContainText(title)
    await expect(label).toHaveValue(`Giữ lại ${failure}`)
  }
  await expect(page.getByText('Đã lưu bản nháp.', { exact: true })).toHaveCount(0)
})

test('blocks mutations until an unavailable Stage 01 definition is retried successfully', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = { ...configState(), initialConfigUnavailable: true }
  await installStage01ConfigRoutes(page, state)

  await page.goto('/settings/stage-01')
  await expect(page.getByRole('alert')).toContainText('Cấu hình Stage 01 chưa sẵn sàng')
  await expect(page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Thao tác bản nháp' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Thử lại' }).click()
  await expect(page.getByRole('heading', { name: 'Cấu hình Stage 01' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' })).toBeVisible()
  expect(state.requests.filter(request => request.method === 'GET')).toHaveLength(2)
  expect(state.requests.filter(request => request.method !== 'GET')).toHaveLength(0)
})

test('prompts before leaving or switching companies only while dirty and preserves the declined selection', async ({ page, authState }) => {
  const alternate = createCompany({
    tenantId: '20000000-0000-4000-8000-000000000001',
    companyId: '20000000-0000-4000-8000-000000000002',
    companyCode: 'ALT',
    companyName: 'Công ty thay thế',
  })
  authState.sessionCompanies = [createCompany(), alternate]
  const state = configState()
  await installStage01ConfigRoutes(page, state)
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()
  await customerTypeLabelInput(page).fill('Chưa lưu')

  page.once('dialog', dialog => dialog.dismiss())
  await page.getByTestId('app-sidebar').getByRole('link', { name: 'Dự án' }).click()
  await expect(page).toHaveURL(/\/settings\/stage-01$/)

  const switcher = page.getByRole('combobox', { name: 'Chuyển công ty' })
  page.once('dialog', dialog => dialog.dismiss())
  await switcher.selectOption(alternate.companyId)
  await expect(switcher).toHaveValue('10000000-0000-4000-8000-000000000002')
  await expect(page.getByTestId('app-header')).toContainText('Công ty TNHH Thiết kế Xây dựng Việt Quốc Huy')

  await page.getByRole('button', { name: 'Hủy thay đổi chưa lưu' }).click()
  await page.getByTestId('app-sidebar').getByRole('link', { name: 'Dự án' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('keeps the 390px configuration controls reachable and inside the mobile shell', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany()]
  const state = configState()
  await installStage01ConfigRoutes(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings/stage-01')
  await page.getByRole('button', { name: 'Bắt đầu chỉnh sửa' }).click()

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.getByTestId('app-header').getByRole('link', { name: 'Cấu hình', exact: true })).toBeVisible()
  await expect(page.locator('.mobile-nav').getByRole('link')).toHaveCount(4)
  await expect(page.locator('.mobile-nav').getByRole('link', { name: 'Cơ hội', exact: true })).toBeVisible()
  await expect(page.locator('.mobile-nav').getByRole('link', { name: 'Cấu hình', exact: true })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Thao tác bản nháp' })).toBeVisible()
  await expect(page.locator('.config-action-bar').getByRole('status')).toContainText('Bản nháp đã đồng bộ')
  await expect(page.getByRole('button', { name: 'Lưu bản nháp' })).toBeDisabled()
})
