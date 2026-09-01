import { createCompany } from './fixtures/auth-routes'
import { expect, test } from './fixtures/authenticated'
import { createStage01OperationalDetail, installStage01OperationalRoutes, stage01OpportunityId, versionConflictBody } from './fixtures/stage01-operational'
import { MOCK_STORAGE_KEY } from '../../app/repositories/mock/state-store'

async function goToWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
}

const mockStorageReadSpyKey = '__stage01MockStorageReadSpy'

async function installMockStorageReadSpy(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(({ storageKey, spyKey }) => {
    const original = Storage.prototype.getItem
    ;(window as typeof window & { [key: string]: { count: number } })[spyKey] = { count: 0 }
    Storage.prototype.getItem = function(key: string): string | null {
      if (key === storageKey) (window as typeof window & { [key: string]: { count: number } })[spyKey].count += 1
      return original.call(this, key)
    }
  }, { storageKey: MOCK_STORAGE_KEY, spyKey: mockStorageReadSpyKey })
}

async function mockStorageReadCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(spyKey => (window as typeof window & { [key: string]: { count: number } })[spyKey]?.count ?? 0, mockStorageReadSpyKey)
}

async function failMockStorageWrite(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(storageKey => {
    localStorage.removeItem(storageKey)
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key: string, value: string): void {
      if (key === storageKey) throw new Error('Synthetic mock employee directory failure')
      original.call(this, key, value)
    }
  }, MOCK_STORAGE_KEY)
}

async function addAccountlessMockEmployee(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(storageKey => {
    const serialized = localStorage.getItem(storageKey)
    if (!serialized) throw new Error('Mock state is unavailable')
    const state = JSON.parse(serialized) as { employees: Array<Record<string, unknown>> }
    const template = state.employees[0]
    if (!template) throw new Error('Mock employee is unavailable')
    state.employees.push({
      ...template,
      id: '10000000-0000-4000-8000-000000000407',
      employeeCode: 'VQH-NO-ACCOUNT',
      fullName: 'Không có tài khoản',
      workEmail: 'no-account@vqh.local',
      account: undefined,
      roles: undefined,
    })
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, MOCK_STORAGE_KEY)
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
  await save.evaluate((button: HTMLButtonElement) => {
    if (!button.form) throw new Error('Opportunity save button is not contained by its form')
    button.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await expect.poll(() => updateRequests).toHaveLength(1)
})

test('workflow starts a ready node then reloads the canonical aggregate', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['start']
  detail.intake.runtime.phase = 'not_started'
  detail.intake.runtime.state = 'ready'
  let canonicalReads = 0
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })]
  await installStage01OperationalRoutes(page, detail, {
    onCanonicalRead: () => { canonicalReads += 1 },
    onWorkflowCommand: request => { commands.push(request) },
  })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Khởi động node' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-nodes/${detail.intake.runtime.nodeExecutionId}/start`),
    body: { expectedExecutionVersion: detail.intake.runtime.version },
  })
  await expect.poll(() => canonicalReads).toBe(2)
})

test('workflow completes each node with its exact owning aggregate version', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['complete']
  detail.intake.gates.satisfied = true
  detail.evaluation.runtime.phase = 'active'
  detail.evaluation.runtime.state = 'active'
  detail.evaluation.gates.satisfied = true
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.complete'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Hoàn tất node' }).nth(0).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-nodes/${detail.intake.runtime.nodeExecutionId}/complete`),
    body: { expectedExecutionVersion: detail.intake.runtime.version, expectedOpportunityVersion: detail.opportunity.version },
  })
  expect(commands[0].body).not.toHaveProperty('expectedCycleVersion')
  await page.getByRole('button', { name: 'Hoàn tất node' }).nth(1).click()
  await expect.poll(() => commands).toHaveLength(2)
  expect(commands[1]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-nodes/${detail.evaluation.runtime.nodeExecutionId}/complete`),
    body: { expectedExecutionVersion: detail.evaluation.runtime.version, expectedCycleVersion: detail.currentDecisionCycle.version },
  })
  expect(commands[1].body).not.toHaveProperty('expectedOpportunityVersion')
})

test('workflow requires a reason and trimmed evidence to revalidate', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.intake.runtime.needsRevalidation = true
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.revalidate'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Tái xác thực node' }).click()
  await page.getByRole('textbox', { name: 'Lý do tái xác thực' }).fill('Điều kiện đã được cập nhật')
  await page.getByRole('textbox', { name: 'Bằng chứng' }).fill('  Biên bản khảo sát  ')
  await page.getByRole('button', { name: 'Xác nhận tái xác thực' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-nodes/${detail.intake.runtime.nodeExecutionId}/revalidate`),
    body: { reason: 'Điều kiện đã được cập nhật', evidence: ['Biên bản khảo sát'], expectedExecutionVersion: detail.intake.runtime.version },
  })
})

test('workflow reopens a completed node with its current execution version', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.intake.runtime.phase = 'completed'
  detail.intake.runtime.state = 'completed'
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.reopen'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Mở lại node' }).click()
  await page.getByRole('textbox', { name: 'Lý do mở lại' }).fill('Cần bổ sung hồ sơ')
  await page.getByRole('button', { name: 'Xác nhận mở lại' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({ body: { reason: 'Cần bổ sung hồ sơ', expectedExecutionVersion: detail.intake.runtime.version } })
})

test('assignment only exposes a directory-backed picker and retains assignment history', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.intake.runtime.assignments.push({
    id: '81000000-0000-4000-8000-000000000040', nodeExecutionId: detail.intake.runtime.nodeExecutionId,
    assignmentKind: 'accountable_owner', assigneeUserId: '81000000-0000-4000-8000-000000000041', assignedBy: '81000000-0000-4000-8000-000000000042', assignedAt: '2026-09-01T00:00:00.000Z', assignmentReason: 'Phụ trách tiếp nhận', endedBy: null, endedAt: null, endReason: null,
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage', 'employee.read_directory'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  const assigneeUserId = await assigneePicker.locator('option').nth(1).getAttribute('value')
  expect(assigneeUserId).toBeTruthy()
  await assigneePicker.selectOption(assigneeUserId!)
  await page.getByRole('button', { name: 'Lưu phân công' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-nodes/${detail.intake.runtime.nodeExecutionId}/assignments`),
    body: { assigneeUserId, expectedExecutionVersion: detail.intake.runtime.version },
  })
  await page.getByRole('button', { name: 'Kết thúc phân công' }).click()
  await page.getByRole('textbox', { name: 'Lý do kết thúc phân công' }).fill('Bàn giao công việc')
  await page.getByRole('button', { name: 'Xác nhận kết thúc phân công' }).click()
  await expect.poll(() => commands).toHaveLength(2)
  expect(commands[1]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-assignments/${detail.intake.runtime.assignments[0].id}/end`),
    body: { endReason: 'Bàn giao công việc', expectedExecutionVersion: detail.intake.runtime.version },
  })
})

test('assignment picker loads account-backed users for employee.read_all', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage', 'employee.read_all'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await installMockStorageReadSpy(page)
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assigneePicker.locator('option').nth(1)).toHaveText('Như')
  await assigneePicker.selectOption({ label: 'Như' })
  await expect.poll(() => mockStorageReadCount(page)).toBe(1)
})

test('does not open an assignment picker or load employees without a directory permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await installMockStorageReadSpy(page)
  await expect(page.getByRole('button', { name: 'Phân công', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Phân công của 01.1 Tiếp nhận').getByText('Bạn không có quyền đọc danh bạ nên chỉ có thể xem lịch sử phân công; không thể chọn một mã người dùng tự do.', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Người được phân công' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /người dùng/i })).toHaveCount(0)
  expect(await mockStorageReadCount(page)).toBe(0)
})

test('assignment and responsible pickers exclude accountless employees', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage', 'journey.blocker.raise', 'employee.read_directory'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Dự án' })).toBeVisible()
  await goToWorkspace(page)
  await addAccountlessMockEmployee(page)
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assigneePicker.getByRole('option', { name: 'Không có tài khoản' })).toHaveCount(0)
  await expect(assigneePicker.locator('option').nth(1)).toHaveText('Như')
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  const responsiblePicker = page.getByRole('combobox', { name: 'Người phụ trách' })
  await expect(responsiblePicker.getByRole('option', { name: 'Không có tài khoản' })).toHaveCount(0)
  await expect(responsiblePicker.locator('option').nth(1)).toHaveText('Như')
})

test('blocker uses bound category values and keeps resolved blockers as history', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.intake.runtime.blockers.push({
    id: '81000000-0000-4000-8000-000000000050', nodeExecutionId: detail.intake.runtime.nodeExecutionId,
    effect: 'blocking', categoryCode: 'follow_up', description: 'Chờ xác nhận', raisedBy: '81000000-0000-4000-8000-000000000051', raisedAt: '2026-09-01T00:00:00.000Z', responsibleUserId: null, resolvedBy: '81000000-0000-4000-8000-000000000052', resolvedAt: '2026-09-01T01:00:00.000Z', resolution: 'Đã xử lý', version: 1,
  })
  detail.evaluation.runtime.blockers.push({
    id: '81000000-0000-4000-8000-000000000053', nodeExecutionId: detail.evaluation.runtime.nodeExecutionId,
    effect: 'non_blocking', categoryCode: 'follow_up', description: 'Chờ phản hồi', raisedBy: '81000000-0000-4000-8000-000000000054', raisedAt: '2026-09-01T00:00:00.000Z', responsibleUserId: null, resolvedBy: null, resolvedAt: null, resolution: null, version: 0,
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise', 'journey.blocker.resolve'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await expect(page.getByText('Đã giải quyết: Đã xử lý')).toBeVisible()
  await page.getByRole('button', { name: 'Nêu blocker' }).nth(0).click()
  await page.getByRole('combobox', { name: 'Danh mục blocker' }).selectOption('follow_up')
  await page.getByRole('textbox', { name: 'Mô tả blocker' }).fill('Cần xác nhận thông tin')
  await page.getByRole('button', { name: 'Lưu blocker' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({ body: { categoryCode: 'follow_up', description: 'Cần xác nhận thông tin', expectedExecutionVersion: detail.intake.runtime.version } })
  await page.getByRole('button', { name: 'Giải quyết blocker' }).click()
  await page.getByRole('textbox', { name: 'Kết luận giải quyết blocker' }).fill('Đã có phản hồi')
  await page.getByRole('button', { name: 'Xác nhận giải quyết blocker' }).click()
  await expect.poll(() => commands).toHaveLength(2)
  expect(commands[1]).toMatchObject({
    pathname: expect.stringContaining(`/workflow-blockers/${detail.evaluation.runtime.blockers[0].id}/resolve`),
    body: { resolution: 'Đã có phản hồi', expectedExecutionVersion: detail.evaluation.runtime.version },
  })
})

for (const [capability, permission, label] of [
  ['start', 'journey.node.start', 'Khởi động node'],
  ['complete', 'journey.node.complete', 'Hoàn tất node'],
] as const) {
  test(`shows ${label} only when ${permission} and the ${capability} capability are both bound`, async ({ page, authState }) => {
    const detail = createStage01OperationalDetail()
    detail.actorCapabilities = [capability]
    if (capability === 'start') {
      detail.intake.runtime.phase = 'not_started'
      detail.intake.runtime.state = 'ready'
    } else {
      detail.intake.gates.satisfied = true
    }
    authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', permission] })]
    await installStage01OperationalRoutes(page, detail)
    await goToWorkspace(page)
    await expect(page.getByRole('button', { name: label }).first()).toBeVisible()
  })

  test(`hides ${label} when ${permission} is present but ${capability} is missing or unrelated`, async ({ page, authState }) => {
    const detail = createStage01OperationalDetail()
    detail.actorCapabilities = [capability === 'start' ? 'complete' : 'start']
    if (capability === 'start') {
      detail.intake.runtime.phase = 'not_started'
      detail.intake.runtime.state = 'ready'
    } else {
      detail.intake.gates.satisfied = true
    }
    authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', permission] })]
    await installStage01OperationalRoutes(page, detail)
    await goToWorkspace(page)
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  })

  test(`hides ${label} when ${capability} is bound but ${permission} is missing`, async ({ page, authState }) => {
    const detail = createStage01OperationalDetail()
    detail.actorCapabilities = [capability]
    if (capability === 'start') {
      detail.intake.runtime.phase = 'not_started'
      detail.intake.runtime.state = 'ready'
    } else {
      detail.intake.gates.satisfied = true
    }
    authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read'] })]
    await installStage01OperationalRoutes(page, detail)
    await goToWorkspace(page)
    await expect(page.getByRole('button', { name: label })).toHaveCount(0)
  })
}

for (const permission of ['employee.read_directory', 'employee.read_all'] as const) {
  test(`loads responsible users for a blocker with ${permission}`, async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise', permission] })]
    await installStage01OperationalRoutes(page)
    await goToWorkspace(page)
    await installMockStorageReadSpy(page)
    await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
    const responsiblePicker = page.getByRole('combobox', { name: 'Người phụ trách' })
    await expect(responsiblePicker.locator('option').nth(1)).toHaveText('Như')
    await responsiblePicker.selectOption({ label: 'Như' })
    await expect.poll(() => mockStorageReadCount(page)).toBe(1)
  })
}

test('does not request or offer a responsible-user input without directory permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise'] })]
  await installStage01OperationalRoutes(page)
  await goToWorkspace(page)
  await installMockStorageReadSpy(page)
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  await expect(page.getByRole('combobox', { name: 'Người phụ trách' })).toHaveCount(0)
  await expect(page.locator('input[type="text"][name*="responsible" i]')).toHaveCount(0)
  expect(await mockStorageReadCount(page)).toBe(0)
})

test('keeps an optional responsible user submitable after the directory request fails', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise', 'employee.read_directory'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  await failMockStorageWrite(page)
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  await expect(page.getByText('Không thể tải danh bạ người phụ trách.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Danh mục blocker' }).selectOption('follow_up')
  await page.getByRole('textbox', { name: 'Mô tả blocker' }).fill('Cần xác nhận thông tin')
  await page.getByRole('button', { name: 'Lưu blocker' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]?.body).not.toHaveProperty('responsibleUserId')
})

test('workflow actions are hidden without their exact permissions', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.intake.runtime.needsRevalidation = true
  detail.intake.runtime.blockers.push({
    id: '81000000-0000-4000-8000-000000000060', nodeExecutionId: detail.intake.runtime.nodeExecutionId,
    effect: 'blocking', categoryCode: 'follow_up', description: 'Chờ xác nhận', raisedBy: '81000000-0000-4000-8000-000000000061', raisedAt: '2026-09-01T00:00:00.000Z', responsibleUserId: null, resolvedBy: null, resolvedAt: null, resolution: null, version: 0,
  })
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)
  await expect(page.getByRole('button', { name: 'Tái xác thực node' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Phân công' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nêu blocker' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Giải quyết blocker' })).toHaveCount(0)
})

test('criterion evaluation renders the bound definition, keeps revisions immutable, and sends applicability-owned fields', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  const criterion = detail.configuration.criteria.find(item => item.dimensionKey === 'commercial_viability')!
  criterion.label = 'Mức độ phù hợp đã gắn'
  criterion.description = 'Mô tả từ snapshot đã gắn.'
  criterion.allowsNotApplicable = true
  detail.currentDecisionCycle.evaluations.push({
    id: '81000000-0000-4000-8000-000000000070', decisionCycleId: detail.currentDecisionCycle.id,
    criterionKey: criterion.key, revision: 1, applicability: 'applicable', result: 'concern', rationale: 'Đánh giá trước đó', evidence: ['Biên bản cũ'],
    evaluatedBy: '81000000-0000-4000-8000-000000000071', evaluatedAt: '2026-09-01T01:00:00.000Z',
  })
  detail.currentDecisionCycle.evaluations.push({
    id: '81000000-0000-4000-8000-000000000072', decisionCycleId: detail.currentDecisionCycle.id,
    criterionKey: criterion.key, revision: 2, applicability: 'applicable', result: 'fit', rationale: 'Đánh giá mới nhất', evidence: ['Biên bản mới'],
    evaluatedBy: '81000000-0000-4000-8000-000000000071', evaluatedAt: '2026-09-01T02:00:00.000Z',
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.evaluation.update'] })]
  await installStage01OperationalRoutes(page, detail, { onStage01Command: request => { commands.push(request) } })
  await goToWorkspace(page)

  await expect(page.getByText('Mọi bản sửa và chu kỳ trước được giữ nguyên; thao tác thành công luôn tải lại dữ liệu chính thức.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mức độ phù hợp đã gắn' })).toBeVisible()
  await expect(page.getByText('Mô tả từ snapshot đã gắn.', { exact: true })).toBeVisible()
  await expect(page.getByText('Tính khả thi thương mại · Bắt buộc', { exact: true })).toBeVisible()
  await expect(page.getByText('Bản sửa #2', { exact: true })).toBeVisible()
  await expect(page.getByText('Bản sửa #1', { exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Khả năng áp dụng: Mức độ phù hợp đã gắn' })).toContainText('Không áp dụng')

  await page.getByRole('combobox', { name: 'Khả năng áp dụng: Mức độ phù hợp đã gắn' }).selectOption('not_applicable')
  await page.getByRole('textbox', { name: 'Bằng chứng: Mức độ phù hợp đã gắn' }).fill('  Không thuộc phạm vi dự án  ')
  await page.getByRole('button', { name: 'Lưu đánh giá: Mức độ phù hợp đã gắn' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/stage-01/evaluations/${criterion.key}/revisions`),
    body: { expectedCycleVersion: detail.currentDecisionCycle.version, applicability: 'not_applicable', result: null, rationale: '', evidence: ['Không thuộc phạm vi dự án'] },
  })
})

test('criterion evaluation requires a result when applicable and does not offer not-applicable when the bound definition forbids it', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  const criterion = detail.configuration.criteria[1]!
  criterion.label = 'Tiêu chí bắt buộc'
  criterion.allowsNotApplicable = false
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.evaluation.update'] })]
  await installStage01OperationalRoutes(page, detail, { onStage01Command: request => { commands.push(request) } })
  await goToWorkspace(page)

  const form = page.getByRole('heading', { name: 'Tiêu chí bắt buộc' }).locator('..')
  await expect(form.getByRole('option', { name: 'Không áp dụng' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Lý do: Tiêu chí bắt buộc' }).fill('Cần quyết định rõ')
  await page.getByRole('button', { name: 'Lưu đánh giá: Tiêu chí bắt buộc' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Chọn kết quả đánh giá' })).toBeVisible()
  expect(commands).toHaveLength(0)
})

test('recommendation and clarification use the current cycle and retain immutable versions', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.currentDecisionCycle.recommendations.push({
    id: '81000000-0000-4000-8000-000000000073', decisionCycleId: detail.currentDecisionCycle.id, version: 1,
    recommendation: 'recommend_proceed', rationale: 'Đề xuất đầu tiên', evidence: ['Bằng chứng đầu tiên'],
    submittedBy: '81000000-0000-4000-8000-000000000071', submittedAt: '2026-09-01T01:00:00.000Z',
  })
  detail.currentDecisionCycle.recommendations.push({
    id: '81000000-0000-4000-8000-000000000074', decisionCycleId: detail.currentDecisionCycle.id, version: 2,
    recommendation: 'recommend_not_proceeding', rationale: 'Đề xuất hiện hành', evidence: [],
    submittedBy: '81000000-0000-4000-8000-000000000071', submittedAt: '2026-09-01T02:00:00.000Z',
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.recommendation.submit', 'stage01.clarification.return'] })]
  await installStage01OperationalRoutes(page, detail, { onStage01Command: request => { commands.push(request) } })
  await goToWorkspace(page)

  await expect(page.getByText('Phiên bản đề xuất #1', { exact: true })).toBeVisible()
  await expect(page.getByText('Phiên bản đề xuất #2', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Loại đề xuất' }).selectOption('recommend_proceed')
  await page.getByRole('textbox', { name: 'Lý do đề xuất' }).fill('  Đã đủ điều kiện  ')
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining('/stage-01/recommendations'),
    body: { expectedCycleVersion: detail.currentDecisionCycle.version, recommendation: 'recommend_proceed', rationale: 'Đã đủ điều kiện', evidence: [] },
  })

  await page.getByRole('textbox', { name: 'Lý do yêu cầu làm rõ' }).fill('  Vui lòng bổ sung dữ liệu  ')
  await page.getByRole('button', { name: 'Yêu cầu làm rõ' }).click()
  await expect.poll(() => commands).toHaveLength(2)
  expect(commands[1]).toMatchObject({
    pathname: expect.stringContaining('/stage-01/clarification-returns'),
    body: { expectedCycleVersion: detail.currentDecisionCycle.version, recommendationId: '81000000-0000-4000-8000-000000000074', reason: 'Vui lòng bổ sung dữ liệu' },
  })
})

test('final decision requires its permission and bound decision capability, preserves a rejected draft, then accepts explicit override rationale', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['decision']
  detail.currentDecisionCycle.recommendations.push({
    id: '81000000-0000-4000-8000-000000000075', decisionCycleId: detail.currentDecisionCycle.id, version: 1,
    recommendation: 'recommend_proceed', rationale: 'Nên tiếp tục', evidence: [],
    submittedBy: '81000000-0000-4000-8000-000000000071', submittedAt: '2026-09-01T01:00:00.000Z',
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.decision.record'] })]
  await installStage01OperationalRoutes(page, detail, {
    requireOverrideRationaleOnce: true,
    onStage01Command: request => { commands.push(request) },
  })
  await goToWorkspace(page)
  await page.getByRole('combobox', { name: 'Kết quả quyết định' }).selectOption('not_proceeding')
  await page.getByRole('textbox', { name: 'Lý do quyết định' }).fill('  Rủi ro hiện tại quá cao  ')
  await page.getByRole('button', { name: 'Ghi nhận quyết định' }).click()
  await expect(page.getByRole('textbox', { name: 'Lý do ghi đè quyết định' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Kết quả quyết định' })).toHaveValue('not_proceeding')
    await expect(page.getByRole('textbox', { name: 'Lý do quyết định' })).toHaveValue('  Rủi ro hiện tại quá cao  ')
  await page.getByRole('textbox', { name: 'Lý do ghi đè quyết định' }).fill('  Chấp nhận rủi ro có kiểm soát  ')
  await page.getByRole('button', { name: 'Ghi nhận quyết định' }).click()
  await expect.poll(() => commands).toHaveLength(2)
  expect(commands[1]).toMatchObject({
    pathname: expect.stringContaining('/stage-01/final-decision'),
    body: { expectedCycleVersion: detail.currentDecisionCycle.version, outcome: 'not_proceeding', rationale: 'Rủi ro hiện tại quá cao', overrideRationale: 'Chấp nhận rủi ro có kiểm soát' },
  })
})

test('decision actions remain hidden without their exact permission or the required bound decision capability', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.currentDecisionCycle.recommendations.push({
    id: '81000000-0000-4000-8000-000000000076', decisionCycleId: detail.currentDecisionCycle.id, version: 1,
    recommendation: 'recommend_proceed', rationale: 'Nên tiếp tục', evidence: [],
    submittedBy: '81000000-0000-4000-8000-000000000071', submittedAt: '2026-09-01T01:00:00.000Z',
  })
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.decision.record'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)
  await expect(page.getByRole('button', { name: 'Ghi nhận quyết định' })).toHaveCount(0)

  detail.actorCapabilities = ['decision']
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read'] })]
  await page.reload()
  await expect(page.getByRole('button', { name: 'Ghi nhận quyết định' })).toHaveCount(0)
})

test('completed decision is read-only and reactivation sends canonical versions then retains ordered previous cycles', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.currentDecisionCycle.finalOutcome = 'proceed'
  detail.currentDecisionCycle.finalRationale = 'Đã phê duyệt.'
  detail.currentDecisionCycle.finalDecisionBy = '81000000-0000-4000-8000-000000000071'
  detail.currentDecisionCycle.finalDecisionAt = '2026-09-01T03:00:00.000Z'
  detail.currentDecisionCycle.finalRecommendationId = '81000000-0000-4000-8000-000000000077'
  detail.currentDecisionCycle.version = 5
  detail.evaluation.runtime.phase = 'completed'
  detail.evaluation.runtime.state = 'completed'
  detail.evaluation.runtime.version = 7
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  let canonicalReads = 0
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.reactivate'] })]
  await installStage01OperationalRoutes(page, detail, {
    onCanonicalRead: () => { canonicalReads += 1 },
    onStage01Command: request => {
      commands.push(request)
      if (!request.pathname.endsWith('/reactivate')) return
      const previous = structuredClone(detail.currentDecisionCycle)
      const current = structuredClone(detail.currentDecisionCycle)
      current.id = '81000000-0000-4000-8000-000000000078'
      current.nodeExecutionId = '81000000-0000-4000-8000-000000000079'
      current.cycleNo = 2
      current.reactivationReason = 'Cần đánh giá lại điều kiện triển khai'
      current.finalOutcome = null
      current.finalDecisionBy = null
      current.finalDecisionAt = null
      current.finalRationale = null
      current.finalRecommendationId = null
      current.overrideRationale = null
      current.version = 0
      current.evaluations = []
      current.recommendations = []
      current.clarificationReturns = []
      detail.decisionCycles = [previous, current]
      detail.currentDecisionCycle = current
      detail.evaluation.runtime.nodeExecutionId = current.nodeExecutionId
      detail.evaluation.runtime.executionNo = 2
      detail.evaluation.runtime.version = 0
      detail.evaluation.runtime.phase = 'active'
      detail.evaluation.runtime.state = 'active'
    },
  })
  await goToWorkspace(page)
  await expect(page.getByText('Quyết định đã ghi nhận: Tiếp tục', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ghi nhận quyết định' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Kích hoạt lại Stage 01' }).click()
  await page.getByRole('textbox', { name: 'Lý do kích hoạt lại' }).fill('  Cần đánh giá lại điều kiện triển khai  ')
  await page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining('/stage-01/reactivate'),
    body: { expectedOpportunityVersion: 3, expectedExecutionVersion: 7, expectedCycleVersion: 5, reason: 'Cần đánh giá lại điều kiện triển khai' },
  })
  await expect.poll(() => canonicalReads).toBe(2)
  await expect(page.getByText('Chu kỳ #1 · Đã hoàn tất', { exact: true })).toBeVisible()
  await expect(page.getByText('Chu kỳ #2 · Đang xử lý', { exact: true })).toBeVisible()
  await expect(page.getByText('Kích hoạt lại: Cần đánh giá lại điều kiện triển khai', { exact: true })).toBeVisible()
})
