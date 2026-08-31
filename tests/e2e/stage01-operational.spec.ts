import { createCompany } from './fixtures/auth-routes'
import { expect, test } from './fixtures/authenticated'
import { createStage01OperationalDetail, installStage01OperationalRoutes, stage01OpportunityId, versionConflictBody } from './fixtures/stage01-operational'

async function goToWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
}

test('keeps intake business controls read-only for a route-authorized reader', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await expect(page.getByRole('heading', { name: 'Liên hệ' })).toBeVisible()
  await expect(page.getByText('Chị Lan', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chỉnh sửa cơ hội' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm liên hệ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm phạm vi' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm người giới thiệu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ghi nhận tiếp nhận' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nêu nghi vấn trùng lặp' })).toHaveCount(0)
})

const intakePermissionCases = [
  ['opportunity.update', 'Chỉnh sửa cơ hội'], ['opportunity.invalidate', 'Làm mất hiệu lực'],
  ['opportunity.contact.manage', 'Thêm liên hệ'], ['opportunity.scope.manage', 'Thêm phạm vi'], ['opportunity.referrer.manage', 'Thêm người giới thiệu'],
  ['opportunity.intake_record.create', 'Ghi nhận tiếp nhận'], ['opportunity.duplicate.raise', 'Nêu nghi vấn trùng lặp'], ['opportunity.duplicate.resolve', 'Giải quyết nghi vấn'],
] as const

for (const [permission, label] of intakePermissionCases) {
  test(`exposes ${label} only to ${permission}`, async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', permission] })]
    await installStage01OperationalRoutes(page)
    await goToWorkspace(page)
    await expect(page.getByRole('button', { name: label })).toBeVisible()
  })
}

test('does not expose a neighbouring intake action without its exact permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.scope.manage'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await expect(page.getByRole('button', { name: 'Thêm phạm vi' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm liên hệ' })).toHaveCount(0)
})

test('exposes restore only to the restore permission when the Opportunity is invalid', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.opportunity.validityState = 'invalid'
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.restore'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)
  await expect(page.getByRole('button', { name: 'Khôi phục hiệu lực' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Làm mất hiệu lực' })).toHaveCount(0)
})

test('requires an explicit draft decision after VERSION_CONFLICT and rehydrates the Opportunity editor before a later save', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.update'] })]
  const detail = createStage01OperationalDetail()
  const updateRequests: Record<string, unknown>[] = []
  await installStage01OperationalRoutes(page, detail)
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}$`), async route => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    updateRequests.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
    if (updateRequests.length === 1) {
      detail.opportunity.primaryCustomerName = 'Tên chính tắc mới'
      detail.opportunity.version = 4
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(versionConflictBody()) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Chỉnh sửa cơ hội' }).click()
  const name = page.getByRole('textbox', { name: 'Tên khách hàng chính' })
  await name.fill('Tên đang chỉnh sửa')
  await page.getByRole('button', { name: 'Lưu cơ hội' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Không thể hoàn tất thao tác' })).toBeVisible()
  await expect(name).toHaveValue('Tên đang chỉnh sửa')
  await expect(page.getByRole('button', { name: 'Giữ bản nháp để xem' })).toBeVisible()
  await page.getByRole('button', { name: 'Bỏ bản nháp và tải lại' }).click()
  await expect(name).toHaveValue('Tên chính tắc mới')

  await name.fill('Tên chỉnh sửa sau tải lại')
  await page.getByRole('button', { name: 'Lưu cơ hội' }).click()
  await expect.poll(() => updateRequests).toHaveLength(2)
  expect(updateRequests[1]).toMatchObject({
    primaryCustomerName: 'Tên chỉnh sửa sau tải lại',
    expectedOpportunityVersion: 4,
  })
})

test('keeps a retained conflicted Opportunity draft inspection-only until it is discarded and reloaded', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.update'] })]
  const detail = createStage01OperationalDetail()
  const updateRequests: Record<string, unknown>[] = []
  await installStage01OperationalRoutes(page, detail)
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}$`), async route => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    updateRequests.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(versionConflictBody()) })
  })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Chỉnh sửa cơ hội' }).click()
  await page.getByRole('textbox', { name: 'Tên khách hàng chính' }).fill('Tên bản nháp xung đột')
  await page.getByRole('button', { name: 'Lưu cơ hội' }).click()
  await expect(page.getByRole('button', { name: 'Giữ bản nháp để xem' })).toBeVisible()

  await page.getByRole('button', { name: 'Giữ bản nháp để xem' }).click()
  const save = page.getByRole('button', { name: 'Lưu cơ hội' })
  await expect(save).toBeDisabled()
  await expect(page.getByText('Bản nháp chỉ dùng để xem. Hãy bỏ bản nháp và tải lại trước khi lưu tiếp.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bỏ bản nháp và tải lại' })).toBeVisible()
  await save.evaluate((button: HTMLButtonElement) => button.click())
  await expect.poll(() => updateRequests).toHaveLength(1)
})
