import { createCompany } from './fixtures/auth-routes'
import { expect, test } from './fixtures/authenticated'
import { createStage01OperationalDetail, createStage01OperationalRouteState, installStage01OperationalRoutes, installStatefulStage01OperationalRoutes, stage01EmployeeDirectoryResponse, stage01OpportunityId, versionConflictBody } from './fixtures/stage01-operational'
import { stage01OperationalDetailSchema } from '../../shared/schemas/stage01-operational'
import { employeeListResponseSchema } from '../../shared/schemas/employees'
import { workflowNodeRuntimeSchema } from '../../shared/schemas/workflow'

async function goToWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
}

test('keeps intake business controls read-only for a route-authorized reader', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read'] })]
  const detail = createStage01OperationalDetail()
  detail.relatedContacts[0]!.methods = []
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)
  await expect(page.getByRole('heading', { name: 'Liên hệ' })).toBeVisible()
  await expect(page.getByText('Chị Lan', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chỉnh sửa cơ hội' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm liên hệ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thêm phương thức' })).toHaveCount(0)
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

test('locates the unique ready Evaluation Runtime article after Intake completion', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['start']
  detail.intake.runtime.phase = 'completed'
  detail.intake.runtime.state = 'completed'
  detail.evaluation.runtime.phase = 'not_started'
  detail.evaluation.runtime.state = 'ready'
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)

  const workflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  const evaluationRuntime = workflowRuntime.locator('article').filter({
    has: page.getByRole('heading', { name: '01.2 Đánh giá', exact: true }),
  })
  const startEvaluationButton = evaluationRuntime.getByRole('button', { name: 'Khởi động node', exact: true })

  await expect(workflowRuntime).toHaveCount(1)
  await expect(evaluationRuntime).toHaveCount(1)
  await expect(evaluationRuntime.getByRole('heading', { name: '01.2 Đánh giá', exact: true })).toBeVisible()
  await expect(startEvaluationButton).toBeVisible()
  await expect(startEvaluationButton).toBeEnabled()
})

test('starts the ready Evaluation runtime with its canonical version then reloads the canonical aggregate', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.actorCapabilities = ['start']
  state.detail.intake.runtime.phase = 'completed'
  state.detail.intake.runtime.state = 'completed'
  state.detail.evaluation.runtime.phase = 'not_started'
  state.detail.evaluation.runtime.state = 'ready'
  const canonicalEvaluation = {
    nodeExecutionId: state.detail.evaluation.runtime.nodeExecutionId,
    version: state.detail.evaluation.runtime.version,
  }
  const company = createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })
  const startPath = `/api/companies/${company.companyId}/workflow-nodes/${canonicalEvaluation.nodeExecutionId}/start`
  const canonicalPath = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  const startResponses: import('@playwright/test').Response[] = []
  const onResponse = (response: import('@playwright/test').Response): void => {
    const url = new URL(response.url())
    if (response.request().method() === 'POST' && url.pathname === startPath) startResponses.push(response)
  }

  authState.sessionCompanies = [company]
  await installStatefulStage01OperationalRoutes(page, state)
  page.on('response', onResponse)
  try {
    await goToWorkspace(page)
    const workflowRuntime = page.getByRole('region', {
      name: 'Điều hành node, phân công và blocker',
      exact: true,
    })
    const evaluationRuntime = workflowRuntime.locator('article').filter({
      has: page.getByRole('heading', { name: '01.2 Đánh giá', exact: true }),
    })
    const startEvaluationButton = evaluationRuntime.getByRole('button', { name: 'Khởi động node', exact: true })
    const startResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === startPath
    })
    const canonicalReload = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === canonicalPath
    })

    await expect(evaluationRuntime).toHaveCount(1)
    await expect(startEvaluationButton).toBeEnabled()
    await startEvaluationButton.click()
    const response = await startResponse
    expect(response.status()).toBeGreaterThanOrEqual(200)
    expect(response.status()).toBeLessThan(300)
    expect(new URL(response.url()).pathname).toBe(startPath)
    expect(JSON.parse(response.request().postData() ?? '{}')).toEqual({
      expectedExecutionVersion: canonicalEvaluation.version,
    })
    const startedRuntime = workflowNodeRuntimeSchema.parse(await response.json())
    expect(startedRuntime.nodeExecutionId).toBe(canonicalEvaluation.nodeExecutionId)

    const canonicalResponse = await canonicalReload
    expect(canonicalResponse.ok()).toBe(true)
    const canonicalDetail = stage01OperationalDetailSchema.parse(await canonicalResponse.json())
    expect(canonicalDetail.evaluation.runtime).toMatchObject({
      nodeExecutionId: canonicalEvaluation.nodeExecutionId,
      state: 'active',
    })
    await expect(workflowRuntime.getByText('Đã khởi động node.', { exact: true })).toBeVisible()
    expect(startResponses).toHaveLength(1)
  } finally {
    page.off('response', onResponse)
  }
})

test('workflow blocker form dispatches the bound Intake command with the canonical runtime version', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.configuration.taxonomies.blocker_category = [{ code: 'reserved_follow_up', label: 'Cần theo dõi thêm' }]
  const commands: { method: string, pathname: string, body: Record<string, unknown> }[] = []
  const company = createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise'] })
  authState.sessionCompanies = [company]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)

  const workflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  const intakeBlockerRegion = workflowRuntime.getByRole('region', {
    name: 'Blocker của 01.1 Tiếp nhận',
    exact: true,
  })
  await intakeBlockerRegion.getByRole('button', { name: 'Nêu blocker', exact: true }).click()
  const blockerForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Lưu blocker', exact: true }),
  })
  await expect(blockerForm).toHaveCount(1)
  await blockerForm.getByRole('combobox', { name: 'Ảnh hưởng', exact: true }).selectOption('blocking')
  await blockerForm.getByRole('combobox', { name: 'Danh mục blocker', exact: true }).selectOption('reserved_follow_up')
  await blockerForm.getByLabel('Mô tả blocker', { exact: true }).fill('Theo dõi blocker Intake')
  await blockerForm.getByRole('button', { name: 'Lưu blocker', exact: true }).click()

  await expect.poll(() => commands).toEqual([{
    method: 'POST',
    pathname: `/api/companies/${company.companyId}/workflow-nodes/${detail.intake.runtime.nodeExecutionId}/blockers`,
    body: {
      effect: 'blocking',
      categoryCode: 'reserved_follow_up',
      description: 'Theo dõi blocker Intake',
      expectedExecutionVersion: detail.intake.runtime.version,
    },
  }])
})

test('workflow prevents Intake completion when the canonical runtime is blocked', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['complete']
  detail.intake.runtime.state = 'blocked'
  detail.intake.gates.satisfied = false
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.complete'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)

  const intake = page.locator('article.workflow-runtime__node').filter({ hasText: '01.1 Tiếp nhận' })
  await expect(intake.getByRole('button', { name: 'Hoàn tất node', exact: true })).toHaveCount(0)
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
  const employeeDirectoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname.endsWith('/employees')
  })
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const directoryResponse = await employeeDirectoryResponse
  expect(directoryResponse.status()).toBe(200)
  const directory = employeeListResponseSchema.parse(await directoryResponse.json())
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assigneePicker.locator('option').nth(1)).toHaveText(directory.items[0]!.fullName)
  const assigneeUserId = directory.items[0]!.account!.userId
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
  const employeeDirectoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname.endsWith('/employees')
  })
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const response = await employeeDirectoryResponse
  expect(response.status()).toBe(200)
  expect(response.request().headers().authorization).toMatch(/^Bearer\s+\S+/u)
  const directory = employeeListResponseSchema.parse(await response.json())
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assigneePicker.locator('option').nth(1)).toHaveText(directory.items[0]!.fullName)
  await assigneePicker.selectOption(directory.items[0]!.account!.userId!)
})

test('does not open an assignment picker or load employees without a directory permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage'] })]
  await installStage01OperationalRoutes(page)
  const employeeRequests: import('@playwright/test').Request[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/employees')) employeeRequests.push(request)
  })
  await goToWorkspace(page)
  await expect(page.getByRole('button', { name: 'Phân công', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Phân công của 01.1 Tiếp nhận').getByText('Bạn không có quyền đọc danh bạ nên chỉ có thể xem lịch sử phân công; không thể chọn một mã người dùng tự do.', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Người được phân công' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /người dùng/i })).toHaveCount(0)
  expect(employeeRequests).toHaveLength(0)
})

test('assignment and responsible pickers exclude accountless employees', async ({ page, authState }) => {
  const accountlessEmployee = {
    ...stage01EmployeeDirectoryResponse.items[0],
    id: '82000000-0000-4000-8000-000000000907',
    employeeCode: 'VQH-NO-ACCOUNT',
    fullName: 'Không có tài khoản',
    workEmail: 'no-account@taskovia.test',
    account: undefined,
    roles: undefined,
  }
  const employeeDirectory = employeeListResponseSchema.parse({
    ...stage01EmployeeDirectoryResponse,
    items: [...stage01EmployeeDirectoryResponse.items, accountlessEmployee],
    total: 2,
  })
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.assignment.manage', 'journey.blocker.raise', 'employee.read_directory'] })]
  await installStage01OperationalRoutes(page, createStage01OperationalDetail(), { employeeDirectoryResponse: employeeDirectory })
  await goToWorkspace(page)
  const employeeDirectoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname.endsWith('/employees')
  })
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công', exact: true }).click()
  const response = await employeeDirectoryResponse
  expect(response.status()).toBe(200)
  expect(employeeListResponseSchema.parse(await response.json()).items).toHaveLength(2)
  const assigneePicker = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assigneePicker.getByRole('option', { name: 'Không có tài khoản' })).toHaveCount(0)
  await expect(assigneePicker.locator('option').nth(1)).toHaveText(stage01EmployeeDirectoryResponse.items[0]!.fullName)
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  const responsiblePicker = page.getByRole('combobox', { name: 'Người phụ trách' })
  await expect(responsiblePicker.getByRole('option', { name: 'Không có tài khoản' })).toHaveCount(0)
  await expect(responsiblePicker.locator('option').nth(1)).toHaveText(stage01EmployeeDirectoryResponse.items[0]!.fullName)
})

test('renders the exact bound blocker category without a local fallback', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.configuration.taxonomies.blocker_category = [
    { code: 'reserved_follow_up', label: 'Cần theo dõi thêm' },
  ]
  authState.sessionCompanies = [createCompany({
    permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise'],
  })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)

  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  const category = page.getByRole('combobox', { name: 'Danh mục blocker' })

  await expect(category.locator('option')).toHaveCount(1)
  await expect(category.locator('option')).toHaveText(['Cần theo dõi thêm'])
  await expect(category).toHaveValue('reserved_follow_up')
  await category.selectOption('reserved_follow_up')
  await expect(category).toHaveValue('reserved_follow_up')
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
    const employeeDirectoryResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname.endsWith('/employees')
    })
    await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
    const response = await employeeDirectoryResponse
    expect(response.status()).toBe(200)
    const directory = employeeListResponseSchema.parse(await response.json())
    const responsiblePicker = page.getByRole('combobox', { name: 'Người phụ trách' })
    await expect(responsiblePicker.locator('option').nth(1)).toHaveText(directory.items[0]!.fullName)
    await responsiblePicker.selectOption(directory.items[0]!.account!.userId!)
  })
}

test('does not request or offer a responsible-user input without directory permission', async ({ page, authState }) => {
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise'] })]
  await installStage01OperationalRoutes(page)
  const employeeRequests: import('@playwright/test').Request[] = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/employees')) employeeRequests.push(request)
  })
  await goToWorkspace(page)
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  await expect(page.getByRole('combobox', { name: 'Người phụ trách' })).toHaveCount(0)
  await expect(page.locator('input[type="text"][name*="responsible" i]')).toHaveCount(0)
  expect(employeeRequests).toHaveLength(0)
})

test('keeps an optional responsible user submitable after the directory request fails', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.blocker.raise', 'employee.read_directory'] })]
  await installStage01OperationalRoutes(page, detail, { onWorkflowCommand: request => { commands.push(request) } })
  await goToWorkspace(page)
  const employeeDirectoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname.endsWith('/employees')
  })
  await page.route(/\/api\/companies\/[^/]+\/employees(?:\?.*)?$/, async route => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'employee-directory-failure', details: {} } }),
    })
  })
  await page.getByRole('button', { name: 'Nêu blocker' }).first().click()
  expect((await employeeDirectoryResponse).status()).toBe(500)
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

test('B4 resolves the unique required customer-need criterion through its visible combobox', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  const criterion = detail.configuration.criteria.find(item => item.dimensionKey === 'customer_need')!
  const optionalCriterion = detail.configuration.criteria.find(item => item.dimensionKey === 'scope_capability')!
  optionalCriterion.criticality = 'optional'
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.evaluation.update'] })]
  await installStage01OperationalRoutes(page, detail, { onStage01Command: request => { commands.push(request) } })
  await goToWorkspace(page)

  const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
  const requiredCriterion = evaluation.getByRole('article').filter({
    has: page.getByRole('heading', { name: criterion.label, level: 3, exact: true }),
  })
  const optionalArticle = evaluation.getByRole('article').filter({
    has: page.getByRole('heading', { name: optionalCriterion.label, level: 3, exact: true }),
  })
  const result = requiredCriterion.getByRole('combobox', { name: `Kết quả đánh giá: ${criterion.label}`, exact: true })

  await expect(requiredCriterion).toHaveCount(1)
  await expect(requiredCriterion).toContainText(`${criterion.dimensionKey === 'customer_need' ? 'Nhu cầu khách hàng' : criterion.label} · Bắt buộc`)
  await expect(optionalArticle).toHaveCount(1)
  await expect(optionalArticle).toContainText('Tùy chọn')
  await expect(result).toHaveCount(1)
  await expect(result).toBeEnabled()
  await result.selectOption('fit')
  await expect(result).toHaveValue('fit')
  await requiredCriterion.getByRole('textbox', { name: `Lý do: ${criterion.label}`, exact: true }).fill('Đủ điều kiện tiếp tục')
  await requiredCriterion.getByRole('button', { name: `Lưu đánh giá: ${criterion.label}`, exact: true }).click()
  await expect.poll(() => commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    pathname: expect.stringContaining(`/stage-01/evaluations/${criterion.key}/revisions`),
    body: { expectedCycleVersion: detail.currentDecisionCycle.version, applicability: 'applicable', result: 'fit', rationale: 'Đủ điều kiện tiếp tục', evidence: [] },
  })
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
  // This isolates the override/draft UI behavior.  Authority establishment itself is
  // exercised through the public candidate/assignment path in the B4 journey below.
  detail.currentDecisionCycle.decisionAuthorityUserId = '81000000-0000-4000-8000-000000000071'
  detail.currentDecisionCycle.authorityResolutionEventId = '81000000-0000-4000-8000-000000000079'
  detail.currentDecisionCycle.authorityResolutionReference = '81000000-0000-4000-8000-000000000079'
  detail.currentDecisionCycle.decisionAuthority = {
    status: 'resolved', userId: detail.currentDecisionCycle.decisionAuthorityUserId,
    employeeId: '81000000-0000-4000-8000-000000000080', displayName: 'Decision actor', positionTitle: null,
    currentActorIsAuthority: true, locked: false,
  }
  detail.currentDecisionCycle.recommendations.push({
    id: '81000000-0000-4000-8000-000000000075', decisionCycleId: detail.currentDecisionCycle.id, version: 1,
    recommendation: 'recommend_proceed', rationale: 'Nên tiếp tục', evidence: [],
    submittedBy: '81000000-0000-4000-8000-000000000071', submittedAt: '2026-09-01T01:00:00.000Z',
  })
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.decision.record'] })]
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
  detail.currentDecisionCycle.finalOutcome = 'not_proceeding'
  detail.currentDecisionCycle.finalRationale = 'Chưa đủ điều kiện triển khai.'
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
  await expect(page.getByText('Quyết định đã ghi nhận: Không tiếp tục', { exact: true })).toBeVisible()
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

test('hides reactivation for a completed proceed decision', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.currentDecisionCycle.finalOutcome = 'proceed'
  detail.currentDecisionCycle.finalRationale = 'Đã phê duyệt.'
  detail.currentDecisionCycle.finalDecisionBy = '81000000-0000-4000-8000-000000000071'
  detail.currentDecisionCycle.finalDecisionAt = '2026-09-01T03:00:00.000Z'
  detail.currentDecisionCycle.finalRecommendationId = '81000000-0000-4000-8000-000000000077'
  detail.evaluation.runtime.phase = 'completed'
  detail.evaluation.runtime.state = 'completed'
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'stage01.reactivate'] })]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)

  await expect(page.getByText('Quyết định đã ghi nhận: Tiếp tục', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kích hoạt lại Stage 01' })).toHaveCount(0)
})

test('loads the authenticated employee directory through the stateful fixture before selecting an accountable owner', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.actorCapabilities = ['start']
  state.detail.opportunity.duplicateConcerns = []
  state.detail.intake.runtime.state = 'ready'
  state.detail.intake.runtime.phase = 'not_started'
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'journey.node.start', 'journey.assignment.manage', 'employee.read_directory',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  await page.getByRole('button', { name: 'Khởi động node' }).click()
  await expect(page.getByLabel('Điều hành node, phân công và blocker').getByText('Trạng thái: active', { exact: false }).first()).toBeVisible()
  const employeeDirectoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === '/api/companies/10000000-0000-4000-8000-000000000002/employees'
  })
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công' }).click()
  const response = await employeeDirectoryResponse

  expect(Boolean(response.request().headers().authorization)).toBe(true)
  expect(response.status()).toBe(200)
  const directory = employeeListResponseSchema.parse(await response.json())
  const assignee = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assignee.locator('option')).toHaveCount(2)
  await assignee.selectOption(directory.items[0]!.account!.userId!)
  await expect(assignee).toHaveValue(directory.items[0]!.account!.userId!)
})

test('stateful acceptance fixture drives canonical Stage 01 commands and preserves immutable decision-cycle history', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.actorCapabilities = ['start', 'complete', 'assignDecisionAuthority', 'decision']
  state.detail.opportunity.duplicateConcerns = []
  state.detail.intake.runtime.state = 'ready'
  state.detail.intake.runtime.phase = 'not_started'
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read',
    'journey.node.start', 'journey.node.complete', 'journey.assignment.manage', 'employee.read_directory',
    'stage01.evaluation.update', 'stage01.recommendation.submit',
    'opportunity.decision_authority.assign', 'opportunity.decision.record', 'stage01.reactivate',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  await page.getByRole('button', { name: 'Khởi động node' }).click()
  await expect(page.getByLabel('Điều hành node, phân công và blocker').getByText('Trạng thái: active', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công' }).click()
  const assignee = page.getByRole('combobox', { name: 'Người được phân công' })
  const assigneeUserId = await assignee.locator('option').nth(1).getAttribute('value')
  expect(assigneeUserId).toBeTruthy()
  await assignee.selectOption(assigneeUserId!)
  await page.getByRole('textbox', { name: 'Lý do phân công' }).fill('Chịu trách nhiệm tiếp nhận')
  await page.getByRole('button', { name: 'Lưu phân công' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeEnabled()
  await page.getByRole('button', { name: 'Hoàn tất node' }).first().click()
  await page.getByRole('button', { name: 'Khởi động node' }).click()

  for (const criterion of state.detail.configuration.criteria) {
    await page.getByRole('combobox', { name: `Kết quả đánh giá: ${criterion.label}` }).selectOption('fit')
    await page.getByRole('textbox', { name: `Lý do: ${criterion.label}` }).fill('Đủ điều kiện tiếp tục')
    await page.getByRole('button', { name: `Lưu đánh giá: ${criterion.label}` }).click()
  }
  await page.getByRole('textbox', { name: 'Lý do đề xuất' }).fill('Nên tiếp tục')
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()
  await page.getByRole('button', { name: 'Chỉ định', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  await expect(page.getByText('Đã chỉ định người có thẩm quyền quyết định.', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Lý do quyết định' }).fill('Đồng ý triển khai')
  await page.getByRole('button', { name: 'Ghi nhận quyết định' }).click()
  await expect(page.getByText('Quyết định đã ghi nhận: Tiếp tục', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeEnabled()
  await page.getByRole('button', { name: 'Hoàn tất node' }).click()
  expect(state.requests.map(request => request.path)).toEqual(expect.arrayContaining([
    expect.stringContaining('/workflow-nodes/'),
    expect.stringContaining('/evaluations/'),
    expect.stringContaining('/recommendations'),
    expect.stringContaining('/final-decision'),
  ]))
})

test('self-assigns Decision Authority through the normal UI, reloads canonically, then enables Final Decision', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['assignDecisionAuthority', 'decision']
  detail.currentDecisionCycle.recommendations.push({
    id: '82000000-0000-4000-8000-000000000651', decisionCycleId: detail.currentDecisionCycle.id,
    version: 1, recommendation: 'recommend_proceed', rationale: 'Recommendation current', evidence: [],
    submittedBy: '82000000-0000-4000-8000-000000000900', submittedAt: '2026-09-01T00:00:00.000Z',
  })
  const company = createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'opportunity.decision_authority.assign', 'opportunity.decision.record',
  ] })
  const base = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/decision-cycles/${detail.currentDecisionCycle.id}`
  const authorityPosts: Array<Record<string, unknown>> = []
  authState.sessionCompanies = [company]
  await installStage01OperationalRoutes(page, detail)
  await page.route(`${base}/authority-candidates`, async route => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{
      userId: '82000000-0000-4000-8000-000000000900', employeeId: '82000000-0000-4000-8000-000000000901',
      displayName: 'Decision actor', positionTitle: 'Director',
    }] }) })
  })
  await page.route(`${base}/authority`, async route => {
    authorityPosts.push(JSON.parse(route.request().postData() ?? '{}'))
    if (authorityPosts.length === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: {
        code: 'INTERNAL_ERROR', message: 'Ambiguous authority command result', requestId: 'authority-ambiguous-result', details: {},
      } }) })
      return
    }
    detail.currentDecisionCycle.decisionAuthorityUserId = '82000000-0000-4000-8000-000000000900'
    detail.currentDecisionCycle.authorityResolutionEventId = '82000000-0000-4000-8000-000000000652'
    detail.currentDecisionCycle.authorityResolutionReference = '82000000-0000-4000-8000-000000000652'
    detail.currentDecisionCycle.decisionAuthority = {
      status: 'resolved', userId: detail.currentDecisionCycle.decisionAuthorityUserId,
      employeeId: '82000000-0000-4000-8000-000000000901', displayName: 'Decision actor', positionTitle: 'Director',
      currentActorIsAuthority: true, locked: false,
    }
    detail.decisionCycles = [detail.currentDecisionCycle]
    detail.currentDecisionCycle.version += 1
    await route.fulfill({ contentType: 'application/json', body: 'null' })
  })

  await goToWorkspace(page)
  const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
  const decision = evaluation.getByRole('button', { name: 'Ghi nhận quyết định', exact: true })
  await expect(evaluation.getByText('Chưa chỉ định người có thẩm quyền quyết định.', { exact: true })).toBeVisible()
  await expect(decision).toBeDisabled()
  await evaluation.getByRole('button', { name: 'Chỉ định', exact: true }).click()
  await evaluation.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  await expect.poll(() => authorityPosts).toHaveLength(1)
  await evaluation.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  await expect.poll(() => authorityPosts).toHaveLength(2)
  expect(authorityPosts[0]?.requestId).toEqual(authorityPosts[1]?.requestId)
  await expect.poll(() => authorityPosts).toHaveLength(2)
  expect(authorityPosts[0]).toMatchObject({ action: 'assign', authorityUserId: '82000000-0000-4000-8000-000000000900', expectedCycleVersion: 0 })
  await expect(evaluation.getByText('Đã chỉ định người có thẩm quyền quyết định.', { exact: true })).toBeVisible()
  await expect(evaluation.getByText(/Đã chỉ định: Decision actor/u)).toBeVisible()
  await expect(decision).toBeEnabled()
})

test('B4 fixture-prepared bound policy exposes normal authority assignment without a transition', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['assignDecisionAuthority']
  detail.currentDecisionCycle.decisionAuthority = {
    status: 'unresolved', userId: null, employeeId: null, displayName: null, positionTitle: null,
    currentActorIsAuthority: false, locked: false,
    policyBinding: { status: 'bound', policySnapshotId: '82000000-0000-4000-8000-000000000610' },
  }
  detail.decisionCycles = [detail.currentDecisionCycle]
  const company = createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'opportunity.decision_authority.assign', 'opportunity.decision.record',
  ] })
  authState.sessionCompanies = [company]
  await installStage01OperationalRoutes(page, detail)
  await goToWorkspace(page)
  const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
  await expect(evaluation.getByRole('button', { name: 'Áp dụng Decision Policy v1', exact: true })).toHaveCount(0)
  await expect(evaluation.getByRole('button', { name: 'Chỉ định', exact: true })).toBeVisible()
})

test('B4 observes exactly one post-reopen Intake completion command and canonical reload', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  const company = createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'journey.node.complete', 'journey.node.reopen',
  ] })
  state.detail.actorCapabilities = ['complete']
  state.detail.opportunity.duplicateConcerns = []
  state.detail.intake.runtime.phase = 'completed'
  state.detail.intake.runtime.state = 'completed'
  state.detail.intake.runtime.assignments = [{
    id: '82000000-0000-4000-8000-000000000701',
    nodeExecutionId: state.detail.intake.runtime.nodeExecutionId,
    assignmentKind: 'accountable_owner',
    assigneeUserId: '11111111-1111-4111-8111-111111111111',
    assignedBy: '82000000-0000-4000-8000-000000000900',
    assignedAt: '2026-09-01T00:00:00.000Z',
    assignmentReason: 'Fixture accountable owner',
    endedBy: null,
    endedAt: null,
    endReason: null,
  }]
  state.detail.evaluation.runtime.phase = 'active'
  state.detail.evaluation.runtime.state = 'active'
  authState.sessionCompanies = [company]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  const canonicalPath = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  const reopenPath = `/api/companies/${company.companyId}/workflow-nodes/${state.detail.intake.runtime.nodeExecutionId}/reopen`
  const intake = page.getByRole('region', { name: 'Điều hành node, phân công và blocker', exact: true })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: '01.1 Tiếp nhận', exact: true }) })
  const reopenResponse = page.waitForResponse(response => (
    response.request().method() === 'POST' && new URL(response.url()).pathname === reopenPath
  ))
  const reopenCanonical = page.waitForResponse(response => (
    response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
  ))
  await intake.getByRole('button', { name: 'Mở lại node', exact: true }).click()
  await intake.getByLabel('Lý do mở lại', { exact: true }).fill('B4 deterministic reopened intake')
  await page.getByRole('button', { name: 'Xác nhận mở lại', exact: true }).click()
  expect((await reopenResponse).ok()).toBe(true)
  expect(stage01OperationalDetailSchema.parse(await (await reopenCanonical).json()).intake.runtime.state).toBe('active')

  const completePath = `/api/companies/${company.companyId}/workflow-nodes/${state.detail.intake.runtime.nodeExecutionId}/complete`
  const observedRequests: Array<{ method: string, pathname: string }> = []
  let completePostWaiterResolved = false
  let canonicalGetWaiterResolved = false
  const onRequest = (request: import('@playwright/test').Request): void => {
    const pathname = new URL(request.url()).pathname
    if ((request.method() === 'POST' && pathname === completePath)
      || (request.method() === 'GET' && pathname === canonicalPath)) {
      observedRequests.push({ method: request.method(), pathname })
    }
  }
  page.on('request', onRequest)
  try {
    const completePost = page.waitForResponse(response => (
      response.request().method() === 'POST' && new URL(response.url()).pathname === completePath
    )).then(response => {
      completePostWaiterResolved = true
      return response
    })
    const canonicalAfterComplete = page.waitForResponse(response => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
    )).then(response => {
      canonicalGetWaiterResolved = true
      return response
    })

    await intake.getByRole('button', { name: 'Hoàn tất node', exact: true }).click()
    expect((await completePost).ok()).toBe(true)
    const canonical = stage01OperationalDetailSchema.parse(await (await canonicalAfterComplete).json())

    expect(completePostWaiterResolved).toBe(true)
    expect(canonicalGetWaiterResolved).toBe(true)
    expect(observedRequests).toEqual([
      { method: 'POST', pathname: completePath },
      { method: 'GET', pathname: canonicalPath },
    ])
    expect(canonical.intake.runtime).toMatchObject({
      nodeExecutionId: state.detail.intake.runtime.nodeExecutionId,
      state: 'completed',
    })
  } finally {
    page.off('request', onRequest)
  }
})

test('B4 serializes required criteria and proposal behind each canonical command reload', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  const company = createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'stage01.evaluation.update', 'stage01.recommendation.submit',
  ] })
  state.detail.intake.runtime.phase = 'completed'
  state.detail.intake.runtime.state = 'completed'
  state.detail.evaluation.runtime.phase = 'active'
  state.detail.evaluation.runtime.state = 'active'
  authState.sessionCompanies = [company]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  const criteria = state.detail.configuration.criteria.filter(criterion => criterion.criticality !== 'optional')
  const firstCriterion = criteria[0]!
  const secondCriterion = criteria[1]!
  const canonicalPath = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  const firstPath = `${canonicalPath}/evaluations/${firstCriterion.key}/revisions`
  let releaseFirst: (() => void) | null = null
  const firstHeld = new Promise<void>(resolve => { releaseFirst = resolve })
  let firstObservedResolve: (() => void) | null = null
  const firstObserved = new Promise<void>(resolve => { firstObservedResolve = resolve })
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'POST' || url.pathname !== firstPath) return route.fallback()
    firstObservedResolve?.()
    await firstHeld
    await route.fallback()
  })

  const runAcceptanceFlow = (async () => {
    for (const criterionDefinition of criteria) {
      const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
      const criterion = evaluation.getByRole('article').filter({
        has: page.getByRole('heading', { name: criterionDefinition.label, level: 3, exact: true }),
      })
      await criterion.getByRole('combobox', { name: `Kết quả đánh giá: ${criterionDefinition.label}`, exact: true }).selectOption('fit')
      await criterion.getByRole('textbox', { name: `Lý do: ${criterionDefinition.label}`, exact: true }).fill(`B4 serial ${criterionDefinition.key}`)
      const commandPath = `${canonicalPath}/evaluations/${criterionDefinition.key}/revisions`
      const command = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === commandPath)
      const canonicalReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
      await criterion.getByRole('button', { name: `Lưu đánh giá: ${criterionDefinition.label}`, exact: true }).click()
      expect((await command).ok()).toBe(true)
      await canonicalReload
    }
    await page.getByLabel('Lý do đề xuất').fill('B4 serial proposal')
    const proposal = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${canonicalPath}/recommendations`)
    const proposalReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
    expect((await proposal).ok()).toBe(true)
    await proposalReload
  })()

  try {
    await firstObserved
    await page.evaluate(() => true)
    await expect(page.getByRole('combobox', { name: `Kết quả đánh giá: ${secondCriterion.label}`, exact: true })).not.toHaveValue('fit')
    expect(state.requests.filter(request => request.path.endsWith(`/evaluations/${secondCriterion.key}/revisions`))).toHaveLength(0)
    expect(state.requests.filter(request => request.path.endsWith('/recommendations'))).toHaveLength(0)
  } finally {
    releaseFirst?.()
    await runAcceptanceFlow
    await page.unroute('**/*')
  }

  expect(state.detail.currentDecisionCycle.evaluations).toHaveLength(criteria.length)
  expect(state.detail.currentDecisionCycle.recommendations).toHaveLength(1)
})

test('B4 serializes Evaluation completion after the real final-decision canonical reload', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  const company = createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'journey.node.complete',
    'stage01.evaluation.update', 'stage01.recommendation.submit',
    'opportunity.decision_authority.assign', 'opportunity.decision.record',
  ] })
  state.detail.actorCapabilities = ['complete', 'assignDecisionAuthority', 'decision']
  state.detail.intake.runtime.phase = 'completed'
  state.detail.intake.runtime.state = 'completed'
  state.detail.evaluation.runtime.phase = 'active'
  state.detail.evaluation.runtime.state = 'active'
  authState.sessionCompanies = [company]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  const criteria = state.detail.configuration.criteria.filter(criterion => criterion.criticality !== 'optional')
  const canonicalPath = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  for (const criterionDefinition of criteria) {
    const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
    const criterion = evaluation.getByRole('article').filter({
      has: page.getByRole('heading', { name: criterionDefinition.label, level: 3, exact: true }),
    })
    await criterion.getByRole('combobox', { name: `Kết quả đánh giá: ${criterionDefinition.label}`, exact: true }).selectOption('fit')
    await criterion.getByRole('textbox', { name: `Lý do: ${criterionDefinition.label}`, exact: true }).fill(`B4 decision pending ${criterionDefinition.key}`)
    const criterionPath = `${canonicalPath}/evaluations/${criterionDefinition.key}/revisions`
    const criterionResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === criterionPath)
    const criterionReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
    await criterion.getByRole('button', { name: `Lưu đánh giá: ${criterionDefinition.label}`, exact: true }).click()
    expect((await criterionResponse).ok()).toBe(true)
    await criterionReload
  }
  await page.getByLabel('Lý do đề xuất').fill('B4 decision pending proposal')
  const proposalResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `${canonicalPath}/recommendations`)
  const proposalReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  expect((await proposalResponse).ok()).toBe(true)
  await proposalReload

  const authorityPath = `/api/companies/${company.companyId}/opportunities/${stage01OpportunityId}/decision-cycles/${state.detail.currentDecisionCycle.id}/authority`
  const authorityPosts: Array<Record<string, unknown>> = []
  const authorityResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === authorityPath)
  const authorityCanonicalReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
  await page.getByRole('button', { name: 'Chỉ định', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  expect((await authorityResponse).ok()).toBe(true)
  const authorityCanonical = stage01OperationalDetailSchema.parse(await (await authorityCanonicalReload).json())
  authorityPosts.push(...state.requests.filter(request => request.path === authorityPath).map(request => request.body as Record<string, unknown>))
  expect(authorityPosts).toHaveLength(1)
  expect(authorityCanonical.currentDecisionCycle.decisionAuthority).toMatchObject({
    status: 'resolved', currentActorIsAuthority: true,
  })

  const decisionPath = `${canonicalPath}/final-decision`
  const completionPath = `/api/companies/${company.companyId}/workflow-nodes/${state.detail.evaluation.runtime.nodeExecutionId}/complete`
  let releaseDecision: (() => void) | null = null
  const decisionHeld = new Promise<void>(resolve => { releaseDecision = resolve })
  let resolveDecisionObserved: (() => void) | null = null
  const decisionObserved = new Promise<void>(resolve => { resolveDecisionObserved = resolve })
  let decisionRequestCount = 0
  let completionRequestCount = 0
  let completionInteractionAttempted = false
  let canonicalReloadAfterDecision = false
  let decisionResponseObserved = false
  const onRequest = (request: import('@playwright/test').Request): void => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === completionPath) completionRequestCount += 1
  }
  const onResponse = (response: import('@playwright/test').Response): void => {
    const url = new URL(response.url())
    if (response.request().method() === 'POST' && url.pathname === decisionPath) decisionResponseObserved = true
    if (decisionResponseObserved && response.request().method() === 'GET' && url.pathname === canonicalPath) canonicalReloadAfterDecision = true
  }
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'POST' || url.pathname !== decisionPath) return route.fallback()
    decisionRequestCount += 1
    resolveDecisionObserved?.()
    await decisionHeld
    await route.fallback()
  })
  page.on('request', onRequest)
  page.on('response', onResponse)

  const runDecisionAndCompletion = (async () => {
    await page.getByRole('textbox', { name: 'Lý do quyết định', exact: true }).fill('B4 decision pending final decision')
    const decisionResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === decisionPath)
    const decisionCanonicalReload = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath)
    await page.getByRole('button', { name: 'Ghi nhận quyết định', exact: true }).click()
    expect((await decisionResponse).ok()).toBe(true)
    const canonical = stage01OperationalDetailSchema.parse(await (await decisionCanonicalReload).json())
    expect(canonical.currentDecisionCycle.finalOutcome).toBe('proceed')
    expect(canonical.evaluation.gates.checks.find(check => check.code === 'FINAL_DECISION_RECORDED')?.status).toBe('satisfied')
    completionInteractionAttempted = true
    await page.getByRole('button', { name: 'Hoàn tất node', exact: true }).click()
  })()

  try {
    await decisionObserved
    await page.evaluate(() => true)
    await expect(page.getByRole('button', { name: 'Hoàn tất node', exact: true })).toBeDisabled()
    expect(decisionRequestCount).toBe(1)
    expect(completionInteractionAttempted).toBe(false)
    expect(completionRequestCount).toBe(0)
    expect(canonicalReloadAfterDecision).toBe(false)
  } finally {
    releaseDecision?.()
    await runDecisionAndCompletion
    page.off('request', onRequest)
    page.off('response', onResponse)
    await page.unroute('**/*')
  }

  expect(decisionRequestCount).toBe(1)
  expect(canonicalReloadAfterDecision).toBe(true)
  expect(completionRequestCount).toBe(1)
  expect(state.detail.currentDecisionCycle.finalOutcome).toBe('proceed')
  expect(state.detail.evaluation.gates.checks.find(check => check.code === 'FINAL_DECISION_RECORDED')?.status).toBe('satisfied')
  expect(state.detail.evaluation.runtime.state).toBe('completed')
})

test('adds a method to an existing methodless Contact without creating another Contact', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.relatedContacts[0]!.methods = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await expect(contactCard.getByRole('button', { name: 'Thêm phương thức', exact: true })).toBeVisible()
  await contactCard.getByRole('button', { name: 'Thêm phương thức', exact: true }).click()
  const methodForm = contactCard.locator('form').filter({ has: page.getByRole('heading', { name: 'Thêm phương thức', exact: true }) })
  await methodForm.getByRole('combobox', { name: 'Loại', exact: true }).selectOption('email')
  await methodForm.getByRole('textbox', { name: 'Giá trị', exact: true }).fill('lan@example.com')
  await methodForm.getByRole('button', { name: 'Lưu phương thức', exact: true }).click()

  await expect(contactCard.getByText('email: lan@example.com · sử dụng được', { exact: true })).toBeVisible()
  expect(state.detail.relatedContacts).toHaveLength(1)
  expect(state.detail.relatedContacts[0]!.id).toBe(state.detail.opportunity.contacts[0]!.contactId)
  expect(state.detail.relatedContacts[0]!.methods).toHaveLength(1)
  expect(state.detail.intake.gates.checks.find(check => check.code === 'CONTACT_METHOD_USABLE')?.status).toBe('satisfied')
})

test('adds a method with the Contact version and exposes canonical recovery on version conflict', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.relatedContacts[0]!.methods = []
  let methodRequest: Record<string, unknown> | null = null
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(/\/api\/companies\/[^/]+\/contacts\/[^/]+\/methods$/u, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    methodRequest = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(versionConflictBody()) })
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm phương thức', exact: true }).click()
  const methodForm = contactCard.locator('form').filter({ has: page.getByRole('heading', { name: 'Thêm phương thức', exact: true }) })
  await methodForm.getByRole('textbox', { name: 'Giá trị', exact: true }).fill('lan-conflict@example.com')
  await methodForm.getByRole('button', { name: 'Lưu phương thức', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Tải lại chính tắc', exact: true })).toBeVisible()
  expect(methodRequest).toMatchObject({ expectedContactVersion: 4, value: 'lan-conflict@example.com' })
})

test('retains a created Contact ID when method creation rejects and retries only the unfinished method', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let methodAttempts = 0
  const requests: Array<{ method: string, path: string, body: unknown }> = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  page.on('request', request => {
    if (request.method() === 'POST') requests.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() })
  })
  await page.route(/\/api\/companies\/[^/]+\/contacts\/[^/]+\/methods$/u, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    methodAttempts += 1
    if (methodAttempts === 1) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PERMISSION_DENIED', message: 'Không có quyền thực hiện thao tác.', requestId: 'contact-method-rejected', details: {} } }) })
      return
    }
    await route.fallback()
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Chị Mai')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)', exact: true }).fill('mai@example.com')
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Điều khiển vận hành Stage 01' }).getByRole('alert')).toContainText('Đã tạo liên hệ')

  const created = state.detail.relatedContacts.find(contact => contact.displayName === 'Chị Mai')
  expect(created).toBeDefined()
  await contactCard.getByRole('button', { name: 'Tiếp tục khôi phục liên hệ', exact: true }).click()
  await expect(page.getByText('Đã tạo và liên kết liên hệ.', { exact: true })).toBeVisible()

  const createRequests = requests.filter(request => request.path.endsWith('/contacts') && !request.path.includes('/opportunities/'))
  const methodRequests = requests.filter(request => request.path.endsWith('/methods'))
  const linkRequests = requests.filter(request => request.path.includes('/opportunities/') && request.path.endsWith('/contacts'))
  expect(createRequests).toHaveLength(1)
  expect(methodAttempts).toBe(2)
  expect(methodRequests).toHaveLength(2)
  expect(linkRequests).toHaveLength(1)
  expect(methodRequests[0]!.path).toBe(methodRequests[1]!.path)
  expect(state.detail.relatedContacts.filter(contact => contact.displayName === 'Chị Mai')).toHaveLength(1)
})

test('recovers a link VERSION_CONFLICT with the same Contact ID and fresh Opportunity version', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let linkAttempts = 0
  let failNextCanonicalRead = false
  const requests: Array<{ method: string, path: string, body: Record<string, unknown> }> = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  page.on('request', request => {
    if (request.method() === 'POST') requests.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() as Record<string, unknown> })
  })
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}/contacts$`), async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    linkAttempts += 1
    if (linkAttempts === 1) {
      state.detail.opportunity.version += 1
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(versionConflictBody()) })
      return
    }
    await route.fallback()
  })
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}/stage-01$`), async route => {
    if (route.request().method() === 'GET' && failNextCanonicalRead) {
      failNextCanonicalRead = false
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'contact-conflict-reload-failure', details: {} } }) })
      return
    }
    await route.fallback()
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Anh Nam')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)', exact: true }).fill('nam@example.com')
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Tải lại và tiếp tục liên hệ', exact: true })).toBeVisible()
  failNextCanonicalRead = true
  await page.getByRole('button', { name: 'Tải lại và tiếp tục liên hệ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Tải lại và tiếp tục liên hệ', exact: true })).toBeVisible()
  expect(linkAttempts).toBe(1)
  await page.getByRole('button', { name: 'Tải lại và tiếp tục liên hệ', exact: true }).click()
  await expect(page.getByText('Đã tạo và liên kết liên hệ.', { exact: true })).toBeVisible()
  const created = state.detail.relatedContacts.find(contact => contact.displayName === 'Anh Nam')
  expect(created).toBeDefined()
  const linkRequests = requests.filter(request => request.path.includes('/opportunities/') && request.path.endsWith('/contacts'))
  expect(linkAttempts).toBe(2)
  expect(linkRequests).toHaveLength(2)
  expect(linkRequests[0]!.body.contactId).toBe(linkRequests[1]!.body.contactId)
  expect(linkRequests[1]!.body.expectedOpportunityVersion).toBeGreaterThan(linkRequests[0]!.body.expectedOpportunityVersion as number)
  expect(state.detail.opportunity.contacts.filter(contact => contact.contactId === created!.id)).toHaveLength(1)
})

test('reconciles an unknown link outcome from canonical data without replaying the link', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let linkAttempts = 0
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}/contacts$`), async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    linkAttempts += 1
    if (linkAttempts === 1) {
      const body = route.request().postDataJSON() as { contactId: string, relationshipCode: string, isPrimary?: boolean }
      const source = state.detail.opportunity.contacts[0]!
      state.detail.opportunity.contacts.push({
        ...source,
        id: '81000000-0000-4000-8000-000000000099',
        contactId: body.contactId,
        relationshipCode: body.relationshipCode,
        isPrimary: body.isPrimary ?? false,
      })
      state.detail.opportunity.version += 1
      await route.abort('failed')
      return
    }
    await route.fallback()
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Chị Hạnh')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)', exact: true }).fill('hanh@example.com')
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()

  await expect(page.getByText('Đã tạo và liên kết liên hệ.', { exact: true })).toBeVisible()
  expect(linkAttempts).toBe(1)
  expect(state.detail.opportunity.contacts.filter(contact => contact.contactId === state.detail.relatedContacts.find(item => item.displayName === 'Chị Hạnh')?.id)).toHaveLength(1)
})

test('does not replay a successful method when linking rejects and the retry resumes at link', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let linkAttempts = 0
  const requests: Array<{ path: string, body: Record<string, unknown> }> = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  page.on('request', request => {
    if (request.method() === 'POST') requests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() as Record<string, unknown> })
  })
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}/contacts$`), async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    linkAttempts += 1
    if (linkAttempts === 1) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PERMISSION_DENIED', message: 'Không có quyền thực hiện thao tác.', requestId: 'contact-link-rejected', details: {} } }) })
      return
    }
    await route.fallback()
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Anh Sơn')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)', exact: true }).fill('son@example.com')
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()
  await expect(contactCard.getByRole('status')).toContainText('chưa liên kết được với cơ hội')
  await contactCard.getByRole('button', { name: 'Tiếp tục khôi phục liên hệ', exact: true }).click()
  await expect(page.getByText('Đã tạo và liên kết liên hệ.', { exact: true })).toBeVisible()

  expect(requests.filter(request => request.path.endsWith('/contacts') && !request.path.includes('/opportunities/'))).toHaveLength(1)
  expect(requests.filter(request => request.path.endsWith('/methods'))).toHaveLength(1)
  expect(requests.filter(request => request.path.includes('/opportunities/') && request.path.endsWith('/contacts'))).toHaveLength(2)
  expect(linkAttempts).toBe(2)
})

test('blocks an unknown Contact-create outcome across reload instead of creating a duplicate', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let createAttempts = 0
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(/\/api\/companies\/[^/]+\/contacts$/u, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    createAttempts += 1
    await route.abort('failed')
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Chưa rõ kết quả')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Không thể xác định kết quả tạo liên hệ' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: 'Không thể xác định kết quả tạo liên hệ' })).toBeVisible()
  await expect(contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true })).toHaveCount(0)
  expect(createAttempts).toBe(1)
})

test('persists a blocked recovery marker before a Contact-create request resolves', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let releaseCreate!: () => void
  let createAttempts = 0
  const createPending = new Promise<void>(resolve => { releaseCreate = resolve })
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(/\/api\/companies\/[^/]+\/contacts$/u, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    createAttempts += 1
    await createPending
    await route.abort('failed')
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Đang chờ tạo')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  const createRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/contacts') && !new URL(request.url()).pathname.includes('/opportunities/'))
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()
  await createRequest
  const reloading = page.reload()
  releaseCreate()
  await reloading
  await expect(page.getByRole('status').filter({ hasText: 'Không thể xác định kết quả tạo liên hệ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm liên hệ', exact: true })).toHaveCount(0)
  expect(createAttempts).toBe(1)
})

test('persists a blocked recovery marker before a Contact-method request resolves', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let releaseMethod!: () => void
  let methodAttempts = 0
  const methodPending = new Promise<void>(resolve => { releaseMethod = resolve })
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(/\/api\/companies\/[^/]+\/contacts\/[^/]+\/methods$/u, async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    methodAttempts += 1
    await methodPending
    await route.abort('failed')
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Đang chờ phương thức')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  await contactCard.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)', exact: true }).fill('pending@example.com')
  const methodRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/methods'))
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()
  await methodRequest
  const reloading = page.reload()
  releaseMethod()
  await reloading
  await expect(page.getByRole('status').filter({ hasText: 'Không thể xác định kết quả thêm phương thức' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm liên hệ', exact: true })).toHaveCount(0)
  expect(methodAttempts).toBe(1)
})

test('fails closed on a malformed persisted Contact recovery marker', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  const recoveryKey = 'taskovia.stage01-contact-recovery.v1:11111111-1111-4111-8111-111111111111:10000000-0000-4000-8000-000000000002:81000000-0000-4000-8000-000000000001'
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await page.addInitScript(key => { window.sessionStorage.setItem(key, '{malformed') }, recoveryKey)
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  await expect(page.getByRole('status').filter({ hasText: 'Không thể lưu hoặc đọc trạng thái khôi phục' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm liên hệ', exact: true })).toHaveCount(0)
})

test('keeps Contact controls locked when final canonical reload fails after a successful link', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  let failNextCanonicalRead = false
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'opportunity.contact.manage'] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.route(new RegExp(`/api/companies/[^/]+/opportunities/${stage01OpportunityId}/stage-01$`), async route => {
    if (route.request().method() === 'GET' && failNextCanonicalRead) {
      failNextCanonicalRead = false
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'contact-final-reload-failure', details: {} } }) })
      return
    }
    await route.fallback()
  })
  await goToWorkspace(page)

  const contactCard = page.locator('.intake-controls__card').filter({ has: page.getByRole('heading', { name: 'Liên hệ', exact: true }) })
  await contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true }).click()
  await contactCard.getByRole('textbox', { name: 'Tên liên hệ', exact: true }).fill('Anh Khôi')
  await contactCard.getByRole('combobox', { name: 'Quan hệ', exact: true }).selectOption('primary_contact')
  failNextCanonicalRead = true
  await contactCard.getByRole('button', { name: 'Tạo và liên kết liên hệ', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Tải lại dữ liệu chính tắc' }).first()).toBeVisible()
  await expect(contactCard.getByRole('button', { name: 'Thêm liên hệ', exact: true })).toHaveCount(0)
  await expect(contactCard.getByRole('button', { name: 'Cập nhật phương thức', exact: true })).toBeDisabled()
})

test('creates an opportunity and completes the Stage 01 happy path through the public workspace', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.opportunities = []
  state.detail.actorCapabilities = ['start', 'complete', 'assignDecisionAuthority', 'decision']
  state.detail.intake.runtime.state = 'ready'
  state.detail.intake.runtime.phase = 'not_started'
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'opportunity.create',
    'opportunity.contact.manage', 'opportunity.scope.manage', 'opportunity.referrer.manage',
    'opportunity.intake_record.create', 'journey.assignment.manage', 'employee.read_directory',
    'journey.node.start', 'journey.node.complete', 'stage01.evaluation.update',
    'stage01.recommendation.submit', 'opportunity.decision_authority.assign', 'opportunity.decision.record',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)

  await page.goto('/opportunities')
  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Tạo cơ hội mới' })
  await createDialog.getByRole('textbox', { name: 'Tên khách hàng chính' }).fill('Khách hàng Stage 01 mới')
  await createDialog.getByRole('combobox', { name: 'Loại khách hàng' }).selectOption('business')
  await createDialog.getByRole('textbox', { name: 'Nhu cầu' }).fill('Hoàn thiện không gian làm việc')
  await createDialog.getByRole('combobox', { name: 'Trạng thái vị trí' }).selectOption('area_known')
  await createDialog.getByRole('combobox', { name: 'Nguồn khách hàng' }).selectOption('referral')
  await createDialog.getByRole('combobox', { name: 'Mức độ tương tác' }).selectOption('active')
  await createDialog.getByRole('button', { name: 'Tạo cơ hội' }).click()

  await expect(page).toHaveURL(new RegExp(`/opportunities/${stage01OpportunityId}/stage-01$`))
  await expect(page.getByRole('heading', { name: 'Khách hàng Stage 01 mới' })).toBeVisible()
  await page.getByRole('button', { name: 'Khởi động node' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()

  await page.getByRole('button', { name: 'Thêm liên hệ' }).click()
  await page.getByRole('textbox', { name: 'Tên liên hệ' }).fill('Chị Minh')
  await page.getByRole('combobox', { name: 'Quan hệ' }).selectOption('primary_contact')
  await page.getByRole('textbox', { name: 'Giá trị phương thức (không bắt buộc)' }).fill('minh@example.com')
  await page.getByRole('checkbox', { name: 'Liên hệ chính' }).check()
  await page.getByRole('button', { name: 'Tạo và liên kết liên hệ' }).click()
  await expect(page.getByText('Đã tạo và liên kết liên hệ.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()

  const scopeCard = page.getByRole('heading', { name: 'Phạm vi', exact: true }).locator('..').locator('..').locator('..')
  await scopeCard.getByRole('button', { name: 'Thêm phạm vi' }).click()
  await scopeCard.getByRole('combobox', { name: 'Phạm vi' }).selectOption('full_design')
  await scopeCard.getByRole('button', { name: 'Lưu phạm vi' }).click()
  await expect(page.getByText('Đã thêm phạm vi.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()

  const referrerCard = page.getByRole('heading', { name: 'Người giới thiệu', exact: true }).locator('..').locator('..').locator('..')
  await referrerCard.getByRole('button', { name: 'Thêm người giới thiệu' }).click()
  await referrerCard.getByRole('combobox', { name: 'Loại người giới thiệu' }).selectOption('partner')
  await referrerCard.getByRole('textbox', { name: 'Tên hiển thị' }).fill('Đối tác mới')
  await referrerCard.getByRole('checkbox', { name: 'Là người giới thiệu chính' }).check()
  await referrerCard.getByRole('button', { name: 'Lưu người giới thiệu' }).click()
  await expect(page.getByText('Đã thêm người giới thiệu.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()

  await page.getByRole('button', { name: 'Ghi nhận tiếp nhận' }).click()
  await page.getByRole('combobox', { name: 'Kênh tiếp nhận' }).selectOption('phone')
  await page.getByRole('textbox', { name: 'Tóm tắt' }).fill('Đã xác nhận nhu cầu tiếp nhận')
  await page.getByRole('button', { name: 'Lưu bản ghi mới' }).click()
  await expect(page.getByText('Đã ghi nhận bản ghi tiếp nhận mới.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()
  await page.getByLabel('Phân công của 01.1 Tiếp nhận').getByRole('button', { name: 'Phân công' }).click()
  const assignee = page.getByRole('combobox', { name: 'Người được phân công' })
  await expect(assignee.locator('option').nth(1)).toBeAttached()
  const assigneeUserId = await assignee.locator('option').nth(1).getAttribute('value')
  expect(assigneeUserId).toBeTruthy()
  await assignee.selectOption(assigneeUserId!)
  await page.getByRole('textbox', { name: 'Lý do phân công' }).fill('Chịu trách nhiệm tiếp nhận')
  await page.getByRole('button', { name: 'Lưu phân công' }).click()
  await expect(page.getByText('Đã cập nhật phân công.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeEnabled()
  await page.getByRole('button', { name: 'Hoàn tất node' }).click()
  await page.getByRole('button', { name: 'Khởi động node' }).click()

  for (const criterion of state.detail.configuration.criteria) {
    await page.getByRole('combobox', { name: `Kết quả đánh giá: ${criterion.label}` }).selectOption('fit')
    await page.getByRole('textbox', { name: `Lý do: ${criterion.label}` }).fill(`Đủ điều kiện: ${criterion.label}`)
    await page.getByRole('button', { name: `Lưu đánh giá: ${criterion.label}` }).click()
  }
  await page.getByRole('textbox', { name: 'Lý do đề xuất' }).fill('Đủ điều kiện để tiếp tục')
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await expect(page.getByRole('button', { name: 'Hoàn tất node' })).toBeDisabled()
  await page.getByRole('button', { name: 'Chỉ định', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  await expect(page.getByText('Đã chỉ định người có thẩm quyền quyết định.', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Lý do quyết định' }).fill('Đồng ý triển khai Stage 01')
  await page.getByRole('button', { name: 'Ghi nhận quyết định' }).click()
  await page.getByRole('button', { name: 'Hoàn tất node' }).click()

  await expect(page.getByText('Quyết định đã ghi nhận: Tiếp tục', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ghi nhận quyết định' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Lưu đánh giá: Nhu cầu khách hàng' })).toHaveCount(0)
  expect(state.detail.currentDecisionCycle.evaluations).toHaveLength(state.detail.configuration.criteria.length)
  expect(state.detail.evaluation.runtime.state).toBe('completed')
  expect(state.detail.opportunity.intakeRecords).toEqual([expect.objectContaining({ summary: 'Đã xác nhận nhu cầu tiếp nhận' })])
  expect(state.detail.intake.runtime.assignments).toEqual([expect.objectContaining({ assigneeUserId, assignmentReason: 'Chịu trách nhiệm tiếp nhận' })])
  expect(state.requests.map(request => request.path)).toEqual(expect.arrayContaining([
    expect.stringContaining('/opportunities'),
    expect.stringContaining('/intake-records'),
    expect.stringContaining('/assignments'),
    expect.stringContaining('/workflow-nodes/'),
    expect.stringContaining('/evaluations/'),
    expect.stringContaining('/recommendations'),
    expect.stringContaining('/final-decision'),
  ]))
})

test('keeps recommendation and clarification history immutable when the completed cycle is reactivated', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.actorCapabilities = ['assignDecisionAuthority', 'decision']
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'stage01.recommendation.submit',
    'stage01.clarification.return', 'opportunity.decision_authority.assign', 'opportunity.decision.record', 'stage01.reactivate',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  await page.getByRole('textbox', { name: 'Lý do đề xuất' }).fill('Đề xuất cần được thẩm định')
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
  await page.getByRole('textbox', { name: 'Lý do yêu cầu làm rõ' }).fill('Bổ sung phân tích ngân sách')
  await page.getByRole('button', { name: 'Yêu cầu làm rõ' }).click()
  await expect(page.getByText('Bổ sung phân tích ngân sách', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Chỉ định', exact: true }).click()
  await page.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
  await expect(page.getByText('Đã chỉ định người có thẩm quyền quyết định.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Kết quả quyết định' }).selectOption('not_proceeding')
  await page.getByRole('textbox', { name: 'Lý do quyết định' }).fill('Sau khi làm rõ, chưa tiếp tục triển khai')
  await page.getByRole('button', { name: 'Ghi nhận quyết định' }).click()
  await page.getByRole('button', { name: 'Kích hoạt lại Stage 01' }).click()
  await page.getByRole('textbox', { name: 'Lý do kích hoạt lại' }).fill('Có thay đổi điều kiện thương mại')
  await page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).click()

  await expect(page.getByText('Chu kỳ #1 · Đã hoàn tất', { exact: true })).toBeVisible()
  await expect(page.getByText('Chu kỳ #2 · Đang xử lý', { exact: true })).toBeVisible()
  await expect(page.getByText('Kích hoạt lại: Có thay đổi điều kiện thương mại', { exact: true })).toBeVisible()
  const prior = state.detail.decisionCycles[0]!
  expect(prior.recommendations).toEqual([expect.objectContaining({ rationale: 'Đề xuất cần được thẩm định' })])
  expect(prior.clarificationReturns).toEqual([expect.objectContaining({ reason: 'Bổ sung phân tích ngân sách' })])
  expect(state.detail.currentDecisionCycle.recommendations).toEqual([])
  expect(state.detail.currentDecisionCycle.clarificationReturns).toEqual([])
})

test('shows stateful 403, 409, and 500 command failures without false success or losing the entered recommendation', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'stage01.recommendation.submit',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await goToWorkspace(page)

  const rationale = page.getByRole('textbox', { name: 'Lý do đề xuất' })
  const commandAlert = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định' }).getByRole('alert')
  const expectedMessages: Record<403 | 409 | 500, string> = {
    403: 'Bạn không có quyền thực hiện thao tác này.',
    409: 'Yêu cầu không thể hoàn tất ở trạng thái hiện tại.',
    500: 'Hệ thống không thể xử lý yêu cầu. Vui lòng thử lại sau.',
  }
  for (const status of [403, 409, 500] as const) {
    const entered = `Bản nháp phải được giữ lại (${status})`
    await rationale.fill(entered)
    state.nextFailure = status
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
    await expect(commandAlert.filter({ hasText: expectedMessages[status] })).toBeVisible()
    await expect(rationale).toHaveValue(entered)
    await expect(page.getByText('Đã gửi đề xuất.', { exact: true })).toHaveCount(0)
    expect(state.detail.currentDecisionCycle.recommendations).toHaveLength(0)
  }
  expect(state.requests.filter(request => request.path.endsWith('/recommendations'))).toHaveLength(3)
})

test('locks mutations after command success when canonical reload fails, then recovers through an explicit GET', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['start']
  detail.intake.runtime.phase = 'not_started'
  detail.intake.runtime.state = 'ready'
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })]
  await installStage01OperationalRoutes(page, detail, {
    onWorkflowCommand: request => {
      commands.push(request)
      detail.intake.runtime.phase = 'active'
      detail.intake.runtime.state = 'active'
    },
  })
  await goToWorkspace(page)

  const canonicalPath = `/api/companies/${authState.sessionCompanies[0]!.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  let failNextCanonicalRead = false
  await page.route(canonicalPath, async route => {
    if (route.request().method() === 'GET' && failNextCanonicalRead) {
      failNextCanonicalRead = false
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'canonical-reload-failure', details: {} } }),
      })
      return
    }
    await route.fallback()
  })

  failNextCanonicalRead = true
  const start = page.getByRole('button', { name: 'Khởi động node' })
  await start.click()
  const recoveryAlert = page.getByRole('alert').filter({ hasText: 'Cần tải lại dữ liệu chính tắc' })
  await expect(recoveryAlert).toBeVisible()
  await expect(start).toBeDisabled()
  expect(commands).toHaveLength(1)

  await start.evaluate(button => (button as HTMLButtonElement).click())
  expect(commands).toHaveLength(1)

  await page.getByRole('button', { name: 'Tải lại dữ liệu chính tắc' }).click()
  await expect(page.getByRole('button', { name: 'Tải lại dữ liệu chính tắc' })).toHaveCount(0)
  await expect(start).toHaveCount(0)
})

test('keeps a failed canonical recovery requirement across navigation away and back', async ({ page, authState }) => {
  const detail = createStage01OperationalDetail()
  detail.actorCapabilities = ['start']
  detail.intake.runtime.phase = 'not_started'
  detail.intake.runtime.state = 'ready'
  const commands: { pathname: string, body: Record<string, unknown> }[] = []
  authState.sessionCompanies = [createCompany({ permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'] })]
  await installStage01OperationalRoutes(page, detail, {
    onWorkflowCommand: request => {
      commands.push(request)
      detail.intake.runtime.phase = 'active'
      detail.intake.runtime.state = 'active'
    },
  })
  await goToWorkspace(page)

  const canonicalPath = `/api/companies/${authState.sessionCompanies[0]!.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  let failNextCanonicalRead = false
  await page.route(canonicalPath, async route => {
    if (route.request().method() === 'GET' && failNextCanonicalRead) {
      failNextCanonicalRead = false
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi kiểm thử.', requestId: 'canonical-reload-navigation-failure', details: {} } }),
      })
      return
    }
    await route.fallback()
  })

  const recovery = page.getByRole('button', { name: 'Tải lại dữ liệu chính tắc' })
  failNextCanonicalRead = true
  await page.getByRole('button', { name: 'Khởi động node' }).click()
  await expect(recovery).toBeVisible()
  expect(commands).toHaveLength(1)

  await page.getByRole('link', { name: 'Cơ hội', exact: true }).click()
  await expect(page).toHaveURL(/\/opportunities$/u)

  failNextCanonicalRead = true
  await page.goBack()
  await expect(recovery).toBeVisible()
  await expect(page.getByText('Không thể tải Stage 01', { exact: true })).toHaveCount(0)

  failNextCanonicalRead = false
  await recovery.click()
  await expect(recovery).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
})

test('does not leak an in-flight Stage 01 command across a header company switch', async ({ page, authState }) => {
  const companyA = createCompany({
    companyCode: 'VQH-A',
    companyName: 'Công ty A',
    permissions: ['project.read', 'journey.read', 'opportunity.read', 'journey.node.start'],
  })
  const companyB = createCompany({
    companyId: '10000000-0000-4000-8000-000000000003',
    companyCode: 'VQH-B',
    companyName: 'Công ty B',
    permissions: ['project.read', 'journey.read', 'opportunity.read'],
  })
  authState.sessionCompanies = [companyA, companyB]

  const detailA = createStage01OperationalDetail()
  detailA.actorCapabilities = ['start']
  detailA.intake.runtime.phase = 'not_started'
  detailA.intake.runtime.state = 'ready'
  const detailB = createStage01OperationalDetail()
  detailB.opportunity.primaryCustomerName = 'Công ty B dữ liệu'

  await installStage01OperationalRoutes(page, detailA)
  await page.goto('/projects')
  await expect(page.getByRole('combobox', { name: 'Chuyển công ty' })).toHaveValue(companyA.companyId)

  let releaseACommand = () => undefined
  let releaseACanonicalRead = () => undefined
  let holdNextCanonicalRead = false
  let aCommandCount = 0
  let aCanonicalReads = 0
  let resolveCommandSeen = () => undefined
  let resolveCanonicalReadSeen = () => undefined
  const commandSeen = new Promise<void>(resolve => { resolveCommandSeen = resolve })
  const canonicalReadSeen = new Promise<void>(resolve => { resolveCanonicalReadSeen = resolve })
  const commandGate = new Promise<void>(resolve => { releaseACommand = resolve })
  const canonicalGate = new Promise<void>(resolve => { releaseACanonicalRead = resolve })
  const companyAStagePath = `/api/companies/${companyA.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  const companyBStagePath = `/api/companies/${companyB.companyId}/opportunities/${stage01OpportunityId}/stage-01`
  const companyAStartPath = `/api/companies/${companyA.companyId}/workflow-nodes/${detailA.intake.runtime.nodeExecutionId}/start`

  await page.route(companyAStagePath, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    aCanonicalReads += 1
    if (holdNextCanonicalRead) {
      holdNextCanonicalRead = false
      resolveCanonicalReadSeen()
      await canonicalGate
    }
    try {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detailA) })
    } catch {
      // A company switch may abort the old page's held request.
    }
  })
  await page.route(companyBStagePath, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detailB) })
  })
  await page.route(companyAStartPath, async route => {
    aCommandCount += 1
    resolveCommandSeen()
    await commandGate
    detailA.intake.runtime.phase = 'active'
    detailA.intake.runtime.state = 'active'
    detailA.intake.runtime.version += 1
    holdNextCanonicalRead = true
    try {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(detailA.intake.runtime) })
    } catch {
      // A company switch may abort the old page's held request.
    }
  })

  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
  await page.getByRole('button', { name: 'Khởi động node', exact: true }).click()
  await commandSeen
  releaseACommand()
  await canonicalReadSeen

  await page.getByRole('combobox', { name: 'Chuyển công ty' }).selectOption(companyB.companyId)
  await expect(page).toHaveURL(/\/projects$/u)
  releaseACanonicalRead()
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty B dữ liệu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toHaveCount(0)
  await expect(page.getByText('Đã khởi động node.', { exact: true })).toHaveCount(0)

  const readsBeforeReturningA = aCanonicalReads
  await page.getByRole('combobox', { name: 'Chuyển công ty' }).selectOption(companyA.companyId)
  await expect(page).toHaveURL(/\/projects$/u)
  await page.goto(`/opportunities/${stage01OpportunityId}/stage-01`)
  await expect(page.getByRole('heading', { name: 'Công ty Việt Quốc Huy' })).toBeVisible()
  const returningAWorkflow = page.getByRole('region', { name: 'Điều hành node, phân công và blocker', exact: true })
  const returningAIntake = returningAWorkflow.locator('article').filter({ has: page.getByRole('heading', { name: '01.1 Tiếp nhận', exact: true }) })
  await expect(returningAIntake).toContainText('Trạng thái: active')
  await expect(returningAIntake.getByRole('button', { name: 'Khởi động node', exact: true })).toHaveCount(0)
  await expect(page.getByText('Đã khởi động node.', { exact: true })).toHaveCount(0)
  expect(aCanonicalReads).toBeGreaterThan(readsBeforeReturningA)
  expect(aCommandCount).toBe(1)
})

test('keeps Stage 01 controls labelled, keyboard-operable, and within a 390px viewport', async ({ page, authState }) => {
  const state = createStage01OperationalRouteState()
  state.detail.actorCapabilities = ['start']
  state.detail.intake.runtime.state = 'ready'
  state.detail.intake.runtime.phase = 'not_started'
  authState.sessionCompanies = [createCompany({ permissions: [
    'project.read', 'journey.read', 'opportunity.read', 'journey.node.start', 'stage01.evaluation.update',
  ] })]
  await installStatefulStage01OperationalRoutes(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await goToWorkspace(page)

  const start = page.getByRole('button', { name: 'Khởi động node' })
  await start.focus()
  await expect(start).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Điều hành node, phân công và blocker').getByText('Trạng thái: active', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Kết quả đánh giá: Nhu cầu khách hàng' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Lý do: Nhu cầu khách hàng' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
