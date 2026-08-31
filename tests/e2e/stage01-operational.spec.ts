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
  await save.evaluate((button: HTMLButtonElement) => {
    if (!button.form) throw new Error('Opportunity save button is not contained by its form')
    button.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await expect.poll(() => updateRequests).toHaveLength(1)
})

test('workflow starts a ready node then reloads the canonical aggregate', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
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
