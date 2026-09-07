import { expect, test, type Page, type Request, type Response } from '@playwright/test'
import { apiErrorBodySchema } from '../../../shared/schemas/api-error'
import { stage01OperationalDetailSchema } from '../../../shared/schemas/stage01-operational'
import { workflowNodeRuntimeSchema, workflowRuntimeSchema } from '../../../shared/schemas/workflow'
import { readB4AcceptanceState, type B4ActorCredential, type B4AcceptanceState } from './acceptance-state'

const canonicalVqhCompanyId = '10000000-0000-4000-8000-000000000020'

type ApiResult = {
  status: number
  body: unknown
}

type SameOriginRequest = {
  method: string
  pathname: string
}

type SameOriginResponse = SameOriginRequest & {
  status: number
}

type EvaluationCommandDiagnostic = {
  label: string
  browserInteractionObserved: boolean
  requestCount: number
  method: 'POST'
  sanitizedPath: string
  status: number | null
  safeApiCode: string | null
  canonicalGetAfterResponse: boolean
  canonicalRevisionPresentAfterReload: boolean | null
  canonicalGateStateAfterReload: { satisfied: boolean, checks: Array<{ code: string, status: string }> } | null
  operationBeforeAction: { previousCommandPending: boolean, previousReloadPending: boolean } | null
}

type ProposalCommandDiagnostic = Omit<EvaluationCommandDiagnostic, 'label' | 'browserInteractionObserved'> & {
  clickObserved: boolean
  evaluationStateAfterReload: string | null
}

function sanitizePathname(pathname: string): string {
  return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, ':id')
}

function safeDiagnosticText(value: unknown): string {
  return String(value)
    .replace(/Bearer\s+[^\s]+/giu, 'Bearer [REDACTED]')
    .replace(/(password|access[_-]?token|refresh[_-]?token|service[_-]?role|api[_-]?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
    .slice(0, 500)
}

function safePageError(error: Error): { name: string, message: string, stackLocation: string | null } {
  const stackLocation = error.stack?.split('\n').find(line => /:\d+:\d+/u.test(line))
  return {
    name: error.name || 'Error',
    message: safeDiagnosticText(error.message),
    stackLocation: stackLocation ? safeDiagnosticText(stackLocation.trim()) : null,
  }
}

function safeApiError(body: unknown): { code: string | null, message: string | null } {
  const error = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: unknown }).error
    : null
  if (!error || typeof error !== 'object') return { code: null, message: null }
  const value = error as { code?: unknown, message?: unknown }
  return {
    code: typeof value.code === 'string' ? safeDiagnosticText(value.code) : null,
    message: typeof value.message === 'string' ? safeDiagnosticText(value.message) : null,
  }
}

async function safeUiErrors(page: Page): Promise<string[]> {
  const errors = await page.getByRole('alert').allTextContents().catch(() => [])
  return errors.map(safeDiagnosticText).filter(Boolean)
}

function safeRequestBodyShape(request: Request): string[] {
  try {
    const body = JSON.parse(request.postData() ?? '{}') as unknown
    return body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : []
  } catch {
    return ['invalid_json']
  }
}

function runText(state: B4AcceptanceState, suffix: string): string {
  return `B4 ${suffix} [${state.runMarker}]`
}

async function login(page: Page, actor: B4ActorCredential): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(actor.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(actor.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/projects$/)
}

async function authenticatedApi(page: Page, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<ApiResult> {
  return page.evaluate(async ({ path, method, body }) => {
    const sessionEntry = Object.entries(localStorage)
      .find(([key]) => key.startsWith('sb-') && key.endsWith('-auth-token'))
    const serializedSession = sessionEntry?.[1]
    const accessToken = serializedSession ? (JSON.parse(serializedSession) as { access_token?: unknown }).access_token : null
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('B4 browser session token is unavailable')

    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const responseBody = await response.json().catch(() => null)
    return { status: response.status, body: responseBody }
  }, { path, method, body })
}

async function unauthenticatedApi(page: Page, path: string, bearer: string): Promise<ApiResult> {
  return page.evaluate(async ({ path, bearer }) => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${bearer}` } })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { path, bearer })
}

async function chooseFirstRealOption(page: Page, label: string): Promise<void> {
  const select = page.getByRole('combobox', { name: label, exact: true })
  await expect(select).toBeVisible()
  const values = await select.locator('option').evaluateAll(options => options
    .map(option => option.getAttribute('value'))
    .filter((value): value is string => Boolean(value)))
  if (values.length === 0) throw new Error(`B4 expected a server-returned option for ${label}`)
  await select.selectOption(values[0]!)
}

function runtimeNode(page: Page, label: '01.1 Tiếp nhận' | '01.2 Đánh giá') {
  return page.locator('article.workflow-runtime__node').filter({ hasText: label })
}

async function addRequiredIntakeData(page: Page, state: B4AcceptanceState): Promise<void> {
  await page.getByRole('button', { name: 'Thêm liên hệ' }).click()
  await page.getByLabel('Tên liên hệ', { exact: true }).fill(runText(state, 'liên hệ chính'))
  await chooseFirstRealOption(page, 'Quan hệ')
  await page.getByLabel('Giá trị phương thức (không bắt buộc)', { exact: true }).fill(`${state.runMarker}@taskovia.invalid`)
  await page.getByRole('checkbox', { name: 'Liên hệ chính', exact: true }).check()
  await page.getByRole('button', { name: 'Tạo và liên kết liên hệ' }).click()
  await expect(page.getByText(runText(state, 'liên hệ chính'), { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Thêm phạm vi' }).click()
  await chooseFirstRealOption(page, 'Phạm vi')
  await page.getByLabel('Ghi chú', { exact: true }).last().fill(runText(state, 'phạm vi'))
  await page.getByRole('button', { name: 'Lưu phạm vi' }).click()
  await expect(page.getByText(runText(state, 'phạm vi'), { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Thêm người giới thiệu' }).click()
  await chooseFirstRealOption(page, 'Loại người giới thiệu')
  await page.getByLabel('Tên hiển thị', { exact: true }).fill(runText(state, 'người giới thiệu'))
  await page.getByLabel('Là người giới thiệu chính', { exact: true }).check()
  await page.getByRole('button', { name: 'Lưu người giới thiệu' }).click()
  await expect(page.getByText(runText(state, 'người giới thiệu'), { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Ghi nhận tiếp nhận' }).click()
  await chooseFirstRealOption(page, 'Kênh tiếp nhận')
  await page.getByLabel('Tóm tắt', { exact: true }).fill(runText(state, 'bản ghi tiếp nhận'))
  await page.getByRole('button', { name: 'Lưu bản ghi mới' }).click()
  await expect(page.getByRole('region', { name: 'Nghiệp vụ tiếp nhận' })
    .locator('p').filter({ hasText: runText(state, 'bản ghi tiếp nhận') })).toBeVisible()
}

async function assignRuntimeOwner(
  page: Page,
  state: B4AcceptanceState,
  opportunityId: string,
  label: '01.1 Tiếp nhận' | '01.2 Đánh giá',
  requireEmployeeDirectory = true,
): Promise<ReturnType<typeof stage01OperationalDetailSchema.parse>> {
  const runtime = runtimeNode(page, label)
  const employeeDirectory = requireEmployeeDirectory
    ? page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET'
        && url.pathname === `/api/companies/${state.companyId}/employees`
    })
    : null
  await runtime.getByRole('button', { name: 'Phân công', exact: true }).click()
  const employeePayload = employeeDirectory === null ? null : await employeeDirectory.then(async employeeResponse => {
    expect(employeeResponse.ok()).toBe(true)
    return employeeResponse.json() as Promise<{
    items: Array<{ id: string, employeeCode: string, fullName: string, account?: { userId?: string } }>
    page: number
    pageSize: number
    total: number
    }>
  })
  const expectedB4Employees = Object.entries(state.actors).map(([kind, actor]) => ({
    id: actor.employeeId,
    employeeCode: `B4-${kind.toUpperCase()}`,
    fullName: `B4 ${kind}`,
    account: { userId: actor.userId },
  }))
  if (employeePayload !== null) {
    expect(Array.isArray(employeePayload.items)).toBe(true)
    expect(Number.isInteger(employeePayload.page)).toBe(true)
    expect(Number.isInteger(employeePayload.pageSize)).toBe(true)
    expect(Number.isInteger(employeePayload.total)).toBe(true)
    for (const expectedEmployee of expectedB4Employees) {
      expect(employeePayload.items.some(employee => (
        employee.id === expectedEmployee.id
        && employee.employeeCode === expectedEmployee.employeeCode
        && employee.fullName === expectedEmployee.fullName
        && employee.account?.userId === expectedEmployee.account.userId
      ))).toBe(true)
    }
    expect(employeePayload.items.some(employee => employee.employeeCode === 'VQH-NHU')).toBe(false)
  }
  const picker = runtime.getByRole('combobox', { name: 'Người được phân công' })
  expect(await picker.locator('option').count()).toBeGreaterThan(1)
  const firstEmployee = await picker.locator('option').nth(1).getAttribute('value')
  if (!firstEmployee) throw new Error('B4 employee picker did not return an account-backed employee')
  const selectedEmployee = employeePayload?.items.find(employee => employee.account?.userId === firstEmployee)
    ?? expectedB4Employees.find(employee => employee.account.userId === firstEmployee)
  if (!selectedEmployee) throw new Error('B4 employee picker did not return a known account-backed B4 employee')
  await picker.selectOption(firstEmployee)
  const assignment = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST'
      && url.pathname.startsWith(`/api/companies/${state.companyId}/workflow-nodes/`)
      && url.pathname.endsWith('/assignments')
  })
  const canonicalReload = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  })
  await runtime.getByRole('button', { name: 'Lưu phân công' }).click()
  expect((await assignment).status()).toBeLessThan(300)
  const canonicalResponse = await canonicalReload
  expect(canonicalResponse.ok()).toBe(true)
  const assignmentCanonicalDetail = stage01OperationalDetailSchema.safeParse(await canonicalResponse.json())
  if (!assignmentCanonicalDetail.success) {
    const issues = assignmentCanonicalDetail.error.issues.map(issue => ({ path: issue.path, code: issue.code }))
    throw new Error(`B4 canonical Stage01 aggregate did not match its schema: ${JSON.stringify(issues)}`)
  }
  const assignedRuntime = label === '01.1 Tiếp nhận'
    ? assignmentCanonicalDetail.data.intake.runtime
    : assignmentCanonicalDetail.data.evaluation.runtime
  expect(assignedRuntime.assignments.some(assignment => (
    assignment.assignmentKind === 'accountable_owner'
    && assignment.assigneeUserId === firstEmployee
    && assignment.endedAt === null
  ))).toBe(true)
  await expect(runtime).toContainText(selectedEmployee.fullName)
  return assignmentCanonicalDetail.data
}

async function evaluateRequiredCriteria(
  page: Page,
  state: B4AcceptanceState,
  opportunityId: string,
  criteria: ReadonlyArray<{ key: string, label: string }>,
  onCriterionInteraction?: (label: string) => void,
): Promise<void> {
  if (criteria.length === 0) throw new Error('B4 expected at least one server-returned non-optional criterion')

  const canonicalStage01Path = `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  for (const [index, criterionDefinition] of criteria.entries()) {
    const { key, label } = criterionDefinition
    const evaluation = page.getByRole('region', { name: 'Đánh giá, đề xuất và quyết định', exact: true })
    await expect(evaluation).toHaveCount(1)
    const criterion = evaluation.getByRole('article').filter({
      has: page.getByRole('heading', { name: label, level: 3, exact: true }),
    })
    const result = criterion.getByRole('combobox', { name: `Kết quả đánh giá: ${label}`, exact: true })
    await expect(criterion).toHaveCount(1)
    await expect(result).toHaveCount(1)
    await expect(result).toBeEnabled()
    await result.selectOption('fit')
    await expect(result).toHaveValue('fit')
    await criterion.getByRole('textbox', { name: `Lý do: ${label}`, exact: true }).fill(runText(state, `đánh giá ${index + 1}`))
    await criterion.getByRole('textbox', { name: `Bằng chứng: ${label}`, exact: true }).fill(runText(state, `bằng chứng ${index + 1}`))
    const criterionPath = `${canonicalStage01Path}/evaluations/${key}/revisions`
    const commandResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === criterionPath
    })
    const canonicalReload = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === canonicalStage01Path
    })
    await criterion.getByRole('button', { name: `Lưu đánh giá: ${label}`, exact: true }).click()
    onCriterionInteraction?.(label)
    const response = await commandResponse
    expect(response.status()).toBeGreaterThanOrEqual(200)
    expect(response.status()).toBeLessThan(300)
    const canonical = stage01OperationalDetailSchema.parse(await (await canonicalReload).json())
    expect(canonical.currentDecisionCycle.evaluations.some(evaluation => evaluation.criterionKey === key)).toBe(true)
  }
}

test.describe.configure({ mode: 'serial' })

test('B4-S01/S04/S06/S08 completes the real acceptance-company journey and preserves canonical history', async ({ page }) => {
  const state = await readB4AcceptanceState(process.cwd())
  const opportunityName = runText(state, 'cơ hội vận hành')
  const blockerDescription = runText(state, 'blocker phải được giải quyết')
  const intakeReopenReason = runText(state, 'bằng chứng Intake đã thay đổi')
  const decisionRationale = runText(state, 'quyết định proceed')
  const reactivationReason = runText(state, 'điều kiện thương mại thay đổi')

  await login(page, state.actors.decision)
  await expect(page.getByTestId('app-header')).toContainText('VQH Stage 01 Acceptance')
  await expect(page.getByTestId('app-header')).not.toContainText('Công ty Việt Quốc Huy')

  await page.goto('/opportunities')
  const createOptions = await authenticatedApi(page, `/api/companies/${state.companyId}/opportunities/create-options`)
  expect(createOptions.status).toBe(200)
  expect((createOptions.body as { publishedSnapshotId?: unknown }).publishedSnapshotId).toBe(state.acceptanceSnapshotId)
  await page.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
  await page.getByLabel('Tên khách hàng chính').fill(opportunityName)
  await page.getByLabel('Nhu cầu').fill(runText(state, 'nhu cầu ban đầu'))
  await chooseFirstRealOption(page, 'Loại khách hàng')
  await chooseFirstRealOption(page, 'Nguồn khách hàng')
  await chooseFirstRealOption(page, 'Mức độ tương tác')
  const initialStage01Response = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname.startsWith(`/api/companies/${state.companyId}/opportunities/`)
      && url.pathname.endsWith('/stage-01')
  })
  await page.getByRole('button', { name: 'Tạo cơ hội' }).click()
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]+\/stage-01$/i)
  const opportunityId = page.url().match(/\/opportunities\/([^/]+)\/stage-01$/u)?.[1]
  if (!opportunityId) throw new Error('B4 opportunity URL did not contain an identifier')
  const initialResponse = await initialStage01Response
  expect(initialResponse.ok()).toBe(true)
  expect(new URL(initialResponse.url()).pathname).toBe(`/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`)
  const initialStage01Detail = stage01OperationalDetailSchema.parse(await initialResponse.json())
  expect(initialStage01Detail.opportunity.id).toBe(opportunityId)
  expect(initialStage01Detail.configuration.taxonomies.blocker_category).toEqual([
    { code: 'reserved_follow_up', label: 'Cần theo dõi thêm' },
  ])
  const workflowBinding = workflowRuntimeSchema.safeParse((await authenticatedApi(page, `/api/companies/${state.companyId}/opportunities/${opportunityId}/workflow`)).body)
  if (!workflowBinding.success) throw new Error('B4 run-marked Opportunity workflow binding is invalid')
  expect(workflowBinding.data.opportunityId).toBe(opportunityId)
  expect(workflowBinding.data.definitionSnapshotId).toBe(state.acceptanceSnapshotId)

  await addRequiredIntakeData(page, state)
  await assignRuntimeOwner(page, state, opportunityId, '01.1 Tiếp nhận')
  const intake = runtimeNode(page, '01.1 Tiếp nhận')
  await expect(intake.getByText('Các điều kiện đã đạt.', { exact: true })).toBeVisible()
  const canonicalAfterStart = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  })
  await intake.getByRole('button', { name: 'Khởi động node' }).click()
  const canonicalAfterStartResponse = await canonicalAfterStart
  expect(canonicalAfterStartResponse.ok()).toBe(true)
  const canonicalAfterStartDetail = stage01OperationalDetailSchema.parse(await canonicalAfterStartResponse.json())
  expect(canonicalAfterStartDetail.intake.runtime.state).toBe('active')

  // B4-S04: the server-returned Intake gate disables completion while a real blocking Blocker is open.
  const workflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  await expect(workflowRuntime).toHaveCount(1)
  await expect(workflowRuntime).toBeVisible()
  const intakeBlockerRegion = workflowRuntime.getByRole('region', {
    name: 'Blocker của 01.1 Tiếp nhận',
    exact: true,
  })
  await expect(intakeBlockerRegion).toHaveCount(1)
  await expect(intakeBlockerRegion).toBeVisible()
  const openBlockerButton = intakeBlockerRegion.getByRole('button', { name: 'Nêu blocker', exact: true })
  await expect(openBlockerButton).toHaveCount(1)
  await openBlockerButton.click()
  const blockerForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Lưu blocker', exact: true }),
  })
  await expect(blockerForm).toHaveCount(1)
  await expect(blockerForm).toBeVisible()
  const blockerCategory = blockerForm.getByRole('combobox', { name: 'Danh mục blocker', exact: true })
  await expect(blockerCategory).toHaveCount(1)
  await expect(blockerCategory).toBeVisible()
  await expect(blockerCategory).toHaveValue('reserved_follow_up')
  await blockerCategory.selectOption({ value: 'reserved_follow_up' })
  await expect(blockerCategory).toHaveValue('reserved_follow_up')
  const blockerEffect = blockerForm.getByRole('combobox', { name: 'Ảnh hưởng', exact: true })
  const blockerDescriptionInput = blockerForm.getByLabel('Mô tả blocker', { exact: true })
  const responsibleUser = blockerForm.getByRole('combobox', { name: 'Người phụ trách', exact: true })
  await blockerEffect.selectOption('blocking')
  await blockerDescriptionInput.fill(blockerDescription)
  const preSubmit = {
    effect: await blockerEffect.inputValue(),
    categoryCode: await blockerCategory.inputValue(),
    description: await blockerDescriptionInput.inputValue(),
    responsibleUserId: await responsibleUser.count() === 1 ? await responsibleUser.inputValue() : null,
    nodeExecutionId: canonicalAfterStartDetail.intake.runtime.nodeExecutionId,
    expectedExecutionVersion: canonicalAfterStartDetail.intake.runtime.version,
  }
  expect(preSubmit.effect).toBe('blocking')
  expect(preSubmit.categoryCode).toBe('reserved_follow_up')
  expect(preSubmit.description).toContain(state.runMarker)
  expect(preSubmit.nodeExecutionId).toBeTruthy()
  expect(preSubmit.expectedExecutionVersion).toBeGreaterThanOrEqual(0)

  const sameOriginRequests: SameOriginRequest[] = []
  const sameOriginResponses: SameOriginResponse[] = []
  const requestFailures: Array<SameOriginRequest & { errorText: string }> = []
  const pageErrors: Array<{ name: string, message: string, stackLocation: string | null }> = []
  const origin = new URL(page.url()).origin
  const onRequest = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin === origin) sameOriginRequests.push({ method: request.method(), pathname: url.pathname })
  }
  const onResponse = (response: Response): void => {
    const request = response.request()
    const url = new URL(response.url())
    if (url.origin === origin) sameOriginResponses.push({ method: request.method(), pathname: url.pathname, status: response.status() })
  }
  const onRequestFailed = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin === origin) {
      requestFailures.push({
        method: request.method(),
        pathname: url.pathname,
        errorText: safeDiagnosticText(request.failure()?.errorText ?? 'unknown request failure'),
      })
    }
  }
  const onPageError = (error: Error): void => { pageErrors.push(safePageError(error)) }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('pageerror', onPageError)
  await blockerForm.evaluate(form => {
    ;(window as typeof window & { __b4BlockerSubmitCount?: number }).__b4BlockerSubmitCount = 0
    form.addEventListener('submit', () => {
      const target = window as typeof window & { __b4BlockerSubmitCount?: number }
      target.__b4BlockerSubmitCount = (target.__b4BlockerSubmitCount ?? 0) + 1
    }, { capture: true, once: true })
  })

  const expectedBlockerPath = `/api/companies/${state.companyId}/workflow-nodes/${preSubmit.nodeExecutionId}/blockers`
  const blockerPost = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST'
      && url.pathname === expectedBlockerPath
  })
  const canonicalAfterBlocker = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  })
  await blockerForm.getByRole('button', { name: 'Lưu blocker', exact: true }).click()
  const blockerResponse = await blockerPost
  expect(blockerResponse.ok()).toBe(true)
  const nativeSubmitCount = await page.evaluate(
    () => (window as typeof window & { __b4BlockerSubmitCount?: number }).__b4BlockerSubmitCount ?? 0,
  )
  const expectedBlockerRequest = sameOriginRequests.find(request => request.method === 'POST' && request.pathname === expectedBlockerPath)
  const matchingBlockerResponse = sameOriginResponses.find(response => response.method === 'POST' && response.pathname === expectedBlockerPath)
  const sameOriginPostCountAfterClick = sameOriginRequests.filter(request => request.method === 'POST').length
  const workflowErrorAlert = await workflowRuntime.getByRole('alert').filter({ hasText: 'Không thể hoàn tất thao tác' }).isVisible()
  const workflowSuccessAlert = await workflowRuntime.getByText('Đã nêu blocker.', { exact: true }).isVisible()
  const canonicalSyncRequired = await page.getByRole('alert').filter({ hasText: 'canonicalSyncRequired' }).isVisible()
  const blockerFormVisible = await blockerForm.isVisible()
  const blockerSaveButton = blockerForm.getByRole('button', { name: 'Lưu blocker', exact: true })
  const blockerSaveButtonDisabled = await blockerSaveButton.isDisabled()
  const canonicalResponse = await canonicalAfterBlocker
  expect(canonicalResponse.ok()).toBe(true)
  const responseApiError = blockerResponse && blockerResponse.status() >= 300
    ? safeApiError(await blockerResponse.json().catch(() => null))
    : null
  page.off('request', onRequest)
  page.off('response', onResponse)
  page.off('requestfailed', onRequestFailed)
  page.off('pageerror', onPageError)
  const diagnostics = {
    nativeSubmitCount,
    preSubmit,
    sameOriginRequests,
    sameOriginResponses,
    sameOriginPostCountAfterClick,
    expectedBlockerPath,
    expectedBlockerRequestObserved: expectedBlockerRequest !== undefined,
    expectedDiagnosticPromiseReportedNone: blockerResponse === null,
    blockerResponseStatus: blockerResponse?.status() ?? null,
    matchingResponseStatus: matchingBlockerResponse?.status ?? null,
    requestFailures,
    workflowErrorAlert,
    workflowSuccessAlert,
    blockerFormVisible,
    blockerSaveButtonDisabled,
    canonicalSyncRequired,
    pageErrors,
    responseApiError,
  }
  const classification = nativeSubmitCount === 0
    ? 'A'
    : expectedBlockerRequest && matchingBlockerResponse === undefined
      ? 'E'
      : !expectedBlockerRequest && sameOriginPostCountAfterClick > 0 && blockerResponse === null
        ? 'D'
        : !expectedBlockerRequest && workflowErrorAlert
          ? 'C'
          : !expectedBlockerRequest && sameOriginPostCountAfterClick === 0 && !workflowErrorAlert && !workflowSuccessAlert
            ? 'B'
            : blockerResponse && blockerResponse.status() >= 300
              ? 'F'
              : blockerResponse && blockerResponse.status() < 300 && canonicalResponse === null
                ? 'G'
                : blockerResponse && blockerResponse.status() < 300 && canonicalResponse
                  ? 'H'
                  : 'UNCLASSIFIED'
  if (classification !== 'H') {
    throw new Error(`B4 blocker dispatch diagnostic: classification=${classification}; evidence=${JSON.stringify(diagnostics)}`)
  }
  expect(nativeSubmitCount).toBe(1)
  if (!canonicalResponse) throw new Error('B4 blocker dispatch diagnostic reached Case H without a canonical response')
  const canonicalAfterBlockerDetail = stage01OperationalDetailSchema.safeParse(await canonicalResponse.json())
  if (!canonicalAfterBlockerDetail.success) {
    const issues = canonicalAfterBlockerDetail.error.issues.map(issue => ({ path: issue.path, code: issue.code }))
    throw new Error(`B4 blocker diagnostic: classification=canonical-schema-failure; canonicalStatus=${canonicalResponse.status()}; issues=${JSON.stringify(issues)}`)
  }
  const noOpenBlockingBlocker = canonicalAfterBlockerDetail.data.intake.gates.checks.find(check => check.code === 'NO_OPEN_BLOCKING_BLOCKER')
  const raisedBlocker = canonicalAfterBlockerDetail.data.intake.runtime.blockers.find(blocker => (
    blocker.effect === 'blocking'
    && blocker.categoryCode === 'reserved_follow_up'
    && blocker.description === blockerDescription
    && blocker.resolvedAt === null
  ))
  expect(canonicalAfterBlockerDetail.data.configuration.taxonomies.blocker_category.map(entry => entry.code)).toContain('reserved_follow_up')
  expect(raisedBlocker).toBeDefined()
  expect(canonicalAfterBlockerDetail.data.intake.runtime.state).toBe('blocked')
  expect(canonicalAfterBlockerDetail.data.intake.gates.satisfied).toBe(false)
  expect(noOpenBlockingBlocker?.status).toBe('blocked')
  await expect(intake.getByRole('button', { name: 'Hoàn tất node', exact: true })).toHaveCount(0)

  const openBlocker = intakeBlockerRegion.locator('li').filter({
    hasText: blockerDescription,
  })
  await expect(openBlocker).toHaveCount(1)
  await openBlocker.getByRole('button', { name: 'Giải quyết blocker', exact: true }).click()
  const resolutionForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Xác nhận giải quyết blocker', exact: true }),
  })
  await expect(resolutionForm).toHaveCount(1)
  await expect(resolutionForm).toBeVisible()
  await resolutionForm.getByLabel('Kết luận giải quyết blocker', { exact: true }).fill(runText(state, 'đã giải quyết blocker'))
  const blockerResolvePost = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST'
      && url.pathname === `/api/companies/${state.companyId}/workflow-blockers/${raisedBlocker!.id}/resolve`
  })
  const canonicalAfterResolution = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET'
      && url.pathname === `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  })
  await resolutionForm.getByRole('button', { name: 'Xác nhận giải quyết blocker', exact: true }).click()
  const resolveResponse = await blockerResolvePost
  expect(resolveResponse.ok()).toBe(true)
  const canonicalResolutionResponse = await canonicalAfterResolution
  expect(canonicalResolutionResponse.ok()).toBe(true)
  const canonicalAfterResolutionDetail = stage01OperationalDetailSchema.safeParse(await canonicalResolutionResponse.json())
  if (!canonicalAfterResolutionDetail.success) {
    const issues = canonicalAfterResolutionDetail.error.issues.map(issue => ({ path: issue.path, code: issue.code }))
    throw new Error(`B4 blocker diagnostic: classification=canonical-resolution-schema-failure; canonicalStatus=${canonicalResolutionResponse.status()}; issues=${JSON.stringify(issues)}`)
  }
  const resolvedBlocker = canonicalAfterResolutionDetail.data.intake.runtime.blockers.find(blocker => blocker.id === raisedBlocker!.id)
  expect(resolvedBlocker).toMatchObject({ id: raisedBlocker!.id, categoryCode: 'reserved_follow_up', resolvedAt: expect.any(String) })
  expect(canonicalAfterResolutionDetail.data.intake.gates.checks.find(check => check.code === 'NO_OPEN_BLOCKING_BLOCKER')?.status).toBe('satisfied')
  expect(canonicalAfterResolutionDetail.data.intake.gates.satisfied).toBe(true)
  await expect(intake.getByRole('button', { name: 'Hoàn tất node' })).toBeEnabled()
  const stage01CanonicalPath = `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  const canonicalAfterIntakeCompletion = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname === stage01CanonicalPath
  })
  await intake.getByRole('button', { name: 'Hoàn tất node' }).click()
  const intakeCompletionCanonicalResponse = await canonicalAfterIntakeCompletion
  expect(intakeCompletionCanonicalResponse.ok()).toBe(true)
  const intakeCompletionCanonicalDetail = stage01OperationalDetailSchema.parse(await intakeCompletionCanonicalResponse.json())
  expect(intakeCompletionCanonicalDetail.intake.runtime.state).toBe('completed')
  await expect(workflowRuntime.getByText('Đã hoàn tất node.', { exact: true })).toBeVisible()

  const evaluation = workflowRuntime.locator('article').filter({
    has: page.getByRole('heading', { name: '01.2 Đánh giá', exact: true }),
  })
  await expect(evaluation).toHaveCount(1)
  const initialStartEvaluationButton = evaluation.getByRole('button', { name: 'Khởi động node', exact: true })
  const postIntakeEvaluation = intakeCompletionCanonicalDetail.evaluation
  await expect(initialStartEvaluationButton).toBeEnabled()
  expect(postIntakeEvaluation.runtime.state).toBe('ready')
  expect(intakeCompletionCanonicalDetail.actorCapabilities).toContain('start')

  // Amendment 13 Case C: a real account-backed B4 employee is assigned through the normal UI,
  // then the assignment's canonical reload becomes the only source for the subsequent start version.
  const postOwnerAssignmentDetail = await assignRuntimeOwner(page, state, opportunityId, '01.2 Đánh giá', false)
  const postOwnerWorkflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  const postOwnerEvaluation = postOwnerWorkflowRuntime.locator('article').filter({
    has: page.getByRole('heading', { name: '01.2 Đánh giá', exact: true }),
  })
  const startEvaluationButton = postOwnerEvaluation.getByRole('button', { name: 'Khởi động node', exact: true })
  await expect(postOwnerEvaluation).toHaveCount(1)
  await expect(startEvaluationButton).toBeEnabled()
  const canonicalEvaluation = postOwnerAssignmentDetail.evaluation
  const activeEvaluationOwners = canonicalEvaluation.runtime.assignments.filter(assignment => (
    assignment.assignmentKind === 'accountable_owner' && assignment.endedAt === null
  ))
  const evaluationStartTrace = {
    canonicalEvaluation: {
      nodeExecutionId: canonicalEvaluation.runtime.nodeExecutionId,
      version: canonicalEvaluation.runtime.version,
      state: canonicalEvaluation.runtime.state,
      phase: canonicalEvaluation.runtime.phase,
      needsRevalidation: canonicalEvaluation.runtime.needsRevalidation,
      activeAccountableOwnerCount: activeEvaluationOwners.length,
      activeAccountableOwnerUserIds: activeEvaluationOwners.map(assignment => assignment.assigneeUserId),
      gates: {
        satisfied: canonicalEvaluation.gates.satisfied,
        checks: canonicalEvaluation.gates.checks.map(check => ({ code: check.code, status: check.status })),
      },
      actorCanStart: intakeCompletionCanonicalDetail.actorCapabilities.includes('start'),
    },
    requests: [] as SameOriginRequest[],
    responses: [] as SameOriginResponse[],
    canonicalResponses: [] as Response[],
    requestFailures: [] as Array<SameOriginRequest & { errorText: string }>,
    pageErrors: [] as Array<{ name: string, message: string, stackLocation: string | null }>,
  }
  const expectedEvaluationStartPath = `/api/companies/${state.companyId}/workflow-nodes/${canonicalEvaluation.runtime.nodeExecutionId}/start`
  const onEvaluationStartRequest = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin === origin) evaluationStartTrace.requests.push({ method: request.method(), pathname: url.pathname })
  }
  const onEvaluationStartResponse = (response: Response): void => {
    const request = response.request()
    const url = new URL(response.url())
    if (url.origin === origin) {
      evaluationStartTrace.responses.push({ method: request.method(), pathname: url.pathname, status: response.status() })
      if (request.method() === 'GET' && url.pathname === stage01CanonicalPath) {
        evaluationStartTrace.canonicalResponses.push(response)
      }
    }
  }
  const onEvaluationStartRequestFailed = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin === origin) {
      evaluationStartTrace.requestFailures.push({
        method: request.method(),
        pathname: url.pathname,
        errorText: safeDiagnosticText(request.failure()?.errorText ?? 'unknown request failure'),
      })
    }
  }
  const onEvaluationStartPageError = (error: Error): void => { evaluationStartTrace.pageErrors.push(safePageError(error)) }
  page.on('request', onEvaluationStartRequest)
  page.on('response', onEvaluationStartResponse)
  page.on('requestfailed', onEvaluationStartRequestFailed)
  page.on('pageerror', onEvaluationStartPageError)
  expect(canonicalEvaluation.runtime.state).toBe('ready')
  expect(canonicalEvaluation.runtime.assignments.some(assignment => (
    assignment.assignmentKind === 'accountable_owner' && assignment.endedAt === null
  ))).toBe(true)
  expect(postOwnerAssignmentDetail.actorCapabilities).toContain('start')
  const evaluationStartPost = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && url.pathname === expectedEvaluationStartPath
  })
  let preReopenCanonicalDetail: ReturnType<typeof stage01OperationalDetailSchema.parse>
  try {
    await startEvaluationButton.click()
    const evaluationStartResponse = await evaluationStartPost
    const startRequestBody = JSON.parse(evaluationStartResponse.request().postData() ?? 'null')
    const hasCanonicalStartVersion = JSON.stringify(startRequestBody) === JSON.stringify({
      expectedExecutionVersion: canonicalEvaluation.runtime.version,
    })
    if (!hasCanonicalStartVersion) {
      throw new Error(`B4 Evaluation start diagnostic: classification=B; trace=${JSON.stringify({
        ...evaluationStartTrace,
        start: { status: evaluationStartResponse.status(), pathname: new URL(evaluationStartResponse.url()).pathname, requestBody: startRequestBody },
      })}`)
    }
    expect(new URL(evaluationStartResponse.url()).pathname).toBe(expectedEvaluationStartPath)
    expect(startRequestBody).toEqual({ expectedExecutionVersion: canonicalEvaluation.runtime.version })

    if (evaluationStartResponse.status() >= 300) {
      const parsedError = apiErrorBodySchema.safeParse(await evaluationStartResponse.json().catch(() => null))
      if (!parsedError.success) {
        throw new Error(`B4 Evaluation start diagnostic: classification=non-2xx-api-error-schema-invalid; trace=${JSON.stringify({
          ...evaluationStartTrace,
          start: { status: evaluationStartResponse.status(), pathname: expectedEvaluationStartPath },
        })}`)
      }
      const apiError = {
        code: parsedError.data.error.code,
        message: safeDiagnosticText(parsedError.data.error.message),
        requestId: safeDiagnosticText(parsedError.data.error.requestId),
      }
      const classification = apiError.code === 'WORKFLOW_OWNER_REQUIRED' && activeEvaluationOwners.length === 0
        ? 'C'
        : apiError.code === 'VERSION_CONFLICT'
          ? 'D-current-version-conflict'
          : apiError.code === 'WORKFLOW_NODE_NOT_READY'
            ? 'E'
            : ['PERMISSION_DENIED', 'COMPANY_FORBIDDEN', 'AUTH_REQUIRED', 'AUTH_INVALID'].includes(apiError.code)
              ? 'F'
              : 'G'
      throw new Error(`B4 Evaluation start diagnostic: classification=${classification}; trace=${JSON.stringify({
        ...evaluationStartTrace,
        start: { status: evaluationStartResponse.status(), pathname: expectedEvaluationStartPath, requestBody: startRequestBody, apiError },
      })}`)
    }

    const startedEvaluation = workflowNodeRuntimeSchema.safeParse(await evaluationStartResponse.json())
    if (!startedEvaluation.success) {
      throw new Error(`B4 Evaluation start diagnostic: classification=2xx-runtime-schema-invalid; trace=${JSON.stringify({
        ...evaluationStartTrace,
        start: { status: evaluationStartResponse.status(), pathname: expectedEvaluationStartPath },
      })}`)
    }
    expect(startedEvaluation.data.nodeExecutionId).toBe(canonicalEvaluation.runtime.nodeExecutionId)
    const preReopenCanonicalResponse = evaluationStartTrace.canonicalResponses[0]
      ?? await page.waitForResponse(response => {
        const url = new URL(response.url())
        return response.request().method() === 'GET' && url.pathname === stage01CanonicalPath
      })
    expect(preReopenCanonicalResponse.ok()).toBe(true)
    preReopenCanonicalDetail = stage01OperationalDetailSchema.parse(await preReopenCanonicalResponse.json())
    const startResponseIndex = evaluationStartTrace.responses.findIndex(response => (
      response.method === 'POST' && response.pathname === expectedEvaluationStartPath
    ))
    const canonicalReloadIndex = evaluationStartTrace.responses.findIndex((response, index) => (
      index > startResponseIndex && response.method === 'GET' && response.pathname === stage01CanonicalPath
    ))
    expect(startResponseIndex).toBeGreaterThanOrEqual(0)
    expect(canonicalReloadIndex).toBeGreaterThan(startResponseIndex)
    await expect(workflowRuntime.getByText('Đã khởi động node.', { exact: true })).toBeVisible()
    expect(preReopenCanonicalDetail.evaluation.runtime).toMatchObject({
      nodeExecutionId: canonicalEvaluation.runtime.nodeExecutionId,
      state: 'active',
    })
  } finally {
    page.off('request', onEvaluationStartRequest)
    page.off('response', onEvaluationStartResponse)
    page.off('requestfailed', onEvaluationStartRequestFailed)
    page.off('pageerror', onEvaluationStartPageError)
  }
  const preReopenIntake = {
    nodeExecutionId: preReopenCanonicalDetail.intake.runtime.nodeExecutionId,
    version: preReopenCanonicalDetail.intake.runtime.version,
    state: preReopenCanonicalDetail.intake.runtime.state,
  }
  const preReopenEvaluation = {
    state: preReopenCanonicalDetail.evaluation.runtime.state,
    needsRevalidation: preReopenCanonicalDetail.evaluation.runtime.needsRevalidation,
  }
  expect(preReopenCanonicalDetail.opportunity.id).toBe(opportunityId)
  expect(preReopenIntake.state).toBe('completed')
  expect(preReopenEvaluation.state).toBe('active')

  // B4-S06: reopening/recompleting the upstream Intake makes the active Evaluation stale;
  // completion is deliberately unreachable until the reopen command, canonical reload, and success UI settle.
  const preReopenWorkflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  await expect(preReopenWorkflowRuntime).toHaveCount(1)
  const intakeRuntime = preReopenWorkflowRuntime.locator('article').filter({
    has: page.getByRole('heading', {
      name: '01.1 Tiếp nhận',
      exact: true,
    }),
  })
  await expect(intakeRuntime).toHaveCount(1)

  const reopenPath = `/api/companies/${state.companyId}/workflow-nodes/${preReopenIntake.nodeExecutionId}/reopen`
  const s06ResponseEvents: SameOriginResponse[] = []
  const s06PageErrors: Array<{ name: string, message: string, stackLocation: string | null }> = []
  const onS06Response = (response: Response): void => {
    const request = response.request()
    const url = new URL(response.url())
    if (url.origin === origin && (
      (request.method() === 'POST' && (url.pathname === reopenPath || url.pathname.endsWith('/complete') || url.pathname.endsWith('/revalidate')))
      || (request.method() === 'GET' && url.pathname === stage01CanonicalPath)
    )) {
      s06ResponseEvents.push({ method: request.method(), pathname: url.pathname, status: response.status() })
    }
  }
  const onS06PageError = (error: Error): void => { s06PageErrors.push(safePageError(error)) }
  page.on('response', onS06Response)
  page.on('pageerror', onS06PageError)

  const reopenPost = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && url.pathname === reopenPath
  })
  const canonicalAfterReopen = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname === stage01CanonicalPath
  })
  await intakeRuntime.getByRole('button', { name: 'Mở lại node', exact: true }).click()
  await intakeRuntime.getByLabel('Lý do mở lại', { exact: true }).fill(intakeReopenReason)
  await page.getByRole('button', { name: 'Xác nhận mở lại', exact: true }).click()
  const reopenResponse = await reopenPost
  expect(reopenResponse.status()).toBeGreaterThanOrEqual(200)
  expect(reopenResponse.status()).toBeLessThan(300)
  const postReopenCanonicalResponse = await canonicalAfterReopen
  expect(postReopenCanonicalResponse.ok()).toBe(true)
  const postReopenCanonicalDetail = stage01OperationalDetailSchema.parse(await postReopenCanonicalResponse.json())
  await expect(preReopenWorkflowRuntime.getByText('Đã mở lại node.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xác nhận mở lại', exact: true })).toHaveCount(0)
  await expect(preReopenWorkflowRuntime.getByRole('alert').filter({ hasText: 'Không thể hoàn tất thao tác' })).toHaveCount(0)
  expect(postReopenCanonicalDetail.opportunity.id).toBe(opportunityId)
  expect(postReopenCanonicalDetail.intake.runtime.nodeExecutionId).toBe(preReopenIntake.nodeExecutionId)
  expect(postReopenCanonicalDetail.intake.runtime.version).toBeGreaterThan(preReopenIntake.version)
  expect(postReopenCanonicalDetail.intake.runtime.state).toBe('active')

  const postReopenWorkflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  await expect(postReopenWorkflowRuntime).toHaveCount(1)
  const postReopenIntake = postReopenWorkflowRuntime.locator('article').filter({
    has: page.getByRole('heading', {
      name: '01.1 Tiếp nhận',
      exact: true,
    }),
  })
  await expect(postReopenIntake).toHaveCount(1)
  const completeIntakeButton = postReopenIntake.getByRole('button', { name: 'Hoàn tất node', exact: true })
  await expect(completeIntakeButton).toHaveCount(1)
  await expect(completeIntakeButton).toBeVisible()
  await expect(completeIntakeButton).toBeEnabled()

  const postReopenIntakeRuntime = {
    nodeExecutionId: postReopenCanonicalDetail.intake.runtime.nodeExecutionId,
    version: postReopenCanonicalDetail.intake.runtime.version,
  }
  const completePath = `/api/companies/${state.companyId}/workflow-nodes/${postReopenIntakeRuntime.nodeExecutionId}/complete`
  const s06CompletionTrace = {
    complete: {
      requestCount: 0,
      responseStatuses: [] as number[],
      requestBodyShapes: [] as string[][],
      waiterResolved: false,
      responseSchemaValid: null as boolean | null,
      safeApiCode: null as string | null,
      sanitizedPath: sanitizePathname(completePath),
    },
    canonical: {
      requestCount: 0,
      responseStatuses: [] as number[],
      waiterResolved: false,
      responseSchemaValid: null as boolean | null,
      sanitizedPath: sanitizePathname(stage01CanonicalPath),
    },
    requestFailures: [] as Array<SameOriginRequest & { errorText: string }>,
    pageErrors: s06PageErrors,
    safeUiErrors: [] as string[],
    clickObserved: false,
    failure: null as string | null,
  }
  const onS06CompletionRequest = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin !== origin) return
    if (request.method() === 'POST' && url.pathname === completePath) {
      s06CompletionTrace.complete.requestCount += 1
      s06CompletionTrace.complete.requestBodyShapes.push(safeRequestBodyShape(request))
    }
    if (request.method() === 'GET' && url.pathname === stage01CanonicalPath) {
      s06CompletionTrace.canonical.requestCount += 1
    }
  }
  const onS06CompletionResponse = (response: Response): void => {
    const request = response.request()
    const url = new URL(response.url())
    if (url.origin !== origin) return
    if (request.method() === 'POST' && url.pathname === completePath) {
      s06CompletionTrace.complete.responseStatuses.push(response.status())
    }
    if (request.method() === 'GET' && url.pathname === stage01CanonicalPath) {
      s06CompletionTrace.canonical.responseStatuses.push(response.status())
    }
  }
  const onS06CompletionRequestFailed = (request: Request): void => {
    const url = new URL(request.url())
    if (url.origin !== origin) return
    if ((request.method() === 'POST' && url.pathname === completePath)
      || (request.method() === 'GET' && url.pathname === stage01CanonicalPath)) {
      s06CompletionTrace.requestFailures.push({
        method: request.method(),
        pathname: sanitizePathname(url.pathname),
        errorText: safeDiagnosticText(request.failure()?.errorText ?? 'unknown request failure'),
      })
    }
  }
  page.on('request', onS06CompletionRequest)
  page.on('response', onS06CompletionResponse)
  page.on('requestfailed', onS06CompletionRequestFailed)

  let postCompleteCanonicalDetail: ReturnType<typeof stage01OperationalDetailSchema.parse>
  try {
    const completePost = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === completePath
    }).then(response => {
      s06CompletionTrace.complete.waiterResolved = true
      return response
    })
    const canonicalAfterComplete = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === stage01CanonicalPath
    }).then(response => {
      s06CompletionTrace.canonical.waiterResolved = true
      return response
    })
    await completeIntakeButton.click()
    s06CompletionTrace.clickObserved = true
    const completeResponse = await completePost
    const completeBody = await completeResponse.json().catch(() => null)
    s06CompletionTrace.complete.responseSchemaValid = workflowNodeRuntimeSchema.safeParse(completeBody).success
    if (!completeResponse.ok()) {
      s06CompletionTrace.complete.safeApiCode = safeApiError(completeBody).code
      throw new Error('B4-S06 completion command returned a non-success status')
    }
    expect(s06CompletionTrace.complete.responseSchemaValid).toBe(true)
    const postCompleteCanonicalResponse = await canonicalAfterComplete
    const canonicalBody = await postCompleteCanonicalResponse.json().catch(() => null)
    const canonical = stage01OperationalDetailSchema.safeParse(canonicalBody)
    s06CompletionTrace.canonical.responseSchemaValid = canonical.success
    expect(postCompleteCanonicalResponse.ok()).toBe(true)
    expect(canonical.success).toBe(true)
    if (!canonical.success) throw new Error('B4-S06 canonical Stage 01 aggregate failed its schema')
    postCompleteCanonicalDetail = canonical.data
    s06CompletionTrace.safeUiErrors = await safeUiErrors(page)
    console.log(`B4 Amendment 23 S06 completion diagnostic ${JSON.stringify(s06CompletionTrace)}`)
  } catch (error) {
    s06CompletionTrace.failure = error instanceof Error ? safeDiagnosticText(error.message) : 'unknown completion observation failure'
    s06CompletionTrace.safeUiErrors = await safeUiErrors(page)
    throw new Error(`B4 Amendment 23 S06 completion diagnostic ${JSON.stringify(s06CompletionTrace)}`, { cause: error })
  } finally {
    page.off('request', onS06CompletionRequest)
    page.off('response', onS06CompletionResponse)
    page.off('requestfailed', onS06CompletionRequestFailed)
  }
  await expect(postReopenWorkflowRuntime.getByText('Đã hoàn tất node.', { exact: true })).toBeVisible()
  expect(postCompleteCanonicalDetail.opportunity.id).toBe(opportunityId)
  expect(postCompleteCanonicalDetail.intake.runtime.nodeExecutionId).toBe(postReopenIntakeRuntime.nodeExecutionId)
  expect(postCompleteCanonicalDetail.intake.runtime.version).toBeGreaterThan(postReopenIntakeRuntime.version)
  expect(postCompleteCanonicalDetail.intake.runtime.state).toBe('completed')
  expect(postCompleteCanonicalDetail.evaluation.runtime.needsRevalidation).toBe(true)

  const reopenResponseIndex = s06ResponseEvents.findIndex(event => event.method === 'POST' && event.pathname === reopenPath)
  const canonicalAfterReopenIndex = s06ResponseEvents.findIndex((event, index) => (
    index > reopenResponseIndex && event.method === 'GET' && event.pathname === stage01CanonicalPath
  ))
  const completeResponseIndex = s06ResponseEvents.findIndex((event, index) => (
    index > canonicalAfterReopenIndex && event.method === 'POST' && event.pathname === completePath
  ))
  const canonicalAfterCompleteIndex = s06ResponseEvents.findIndex((event, index) => (
    index > completeResponseIndex && event.method === 'GET' && event.pathname === stage01CanonicalPath
  ))
  expect(reopenResponseIndex).toBeGreaterThanOrEqual(0)
  expect(canonicalAfterReopenIndex).toBeGreaterThan(reopenResponseIndex)
  expect(completeResponseIndex).toBeGreaterThan(canonicalAfterReopenIndex)
  expect(canonicalAfterCompleteIndex).toBeGreaterThan(completeResponseIndex)

  const postCompleteWorkflowRuntime = page.getByRole('region', {
    name: 'Điều hành node, phân công và blocker',
    exact: true,
  })
  const postCompleteEvaluation = postCompleteWorkflowRuntime.locator('article').filter({
    has: page.getByRole('heading', {
      name: '01.2 Đánh giá',
      exact: true,
    }),
  })
  await expect(postCompleteEvaluation).toHaveCount(1)
  await expect(postCompleteEvaluation.getByText('Cần tái xác thực', { exact: true })).toBeVisible()
  const postCompleteEvaluationRuntime = {
    nodeExecutionId: postCompleteCanonicalDetail.evaluation.runtime.nodeExecutionId,
    version: postCompleteCanonicalDetail.evaluation.runtime.version,
  }
  const revalidatePath = `/api/companies/${state.companyId}/workflow-nodes/${postCompleteEvaluationRuntime.nodeExecutionId}/revalidate`
  await postCompleteEvaluation.getByRole('button', { name: 'Tái xác thực node', exact: true }).click()
  await postCompleteEvaluation.getByLabel('Lý do tái xác thực', { exact: true }).fill(runText(state, 'đã kiểm tra lại phụ thuộc'))
  await postCompleteEvaluation.getByLabel('Bằng chứng', { exact: true }).fill(runText(state, 'bằng chứng phụ thuộc hiện hành'))
  const revalidatePost = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'POST' && url.pathname === revalidatePath
  })
  const canonicalAfterRevalidation = page.waitForResponse(response => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' && url.pathname === stage01CanonicalPath
  })
  await postCompleteEvaluation.getByRole('button', { name: 'Xác nhận tái xác thực', exact: true }).click()
  const revalidateResponse = await revalidatePost
  expect(revalidateResponse.status()).toBeGreaterThanOrEqual(200)
  expect(revalidateResponse.status()).toBeLessThan(300)
  const postRevalidationCanonicalResponse = await canonicalAfterRevalidation
  expect(postRevalidationCanonicalResponse.ok()).toBe(true)
  const postRevalidationCanonicalDetail = stage01OperationalDetailSchema.parse(await postRevalidationCanonicalResponse.json())
  await expect(postCompleteWorkflowRuntime.getByText('Đã tái xác thực node.', { exact: true })).toBeVisible()
  expect(postRevalidationCanonicalDetail.opportunity.id).toBe(opportunityId)
  expect(postRevalidationCanonicalDetail.evaluation.runtime.nodeExecutionId).toBe(postCompleteEvaluationRuntime.nodeExecutionId)
  expect(postRevalidationCanonicalDetail.evaluation.runtime.version).toBeGreaterThan(postCompleteEvaluationRuntime.version)
  expect(postRevalidationCanonicalDetail.evaluation.runtime.needsRevalidation).toBe(false)
  expect(s06PageErrors).toEqual([])
  page.off('response', onS06Response)
  page.off('pageerror', onS06PageError)

  const requiredCriteria = postRevalidationCanonicalDetail.configuration.criteria.filter(criterion => criterion.criticality !== 'optional')
  const canonicalStage01Path = `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
  const criterionDiagnostics: EvaluationCommandDiagnostic[] = requiredCriteria.map(criterion => ({
    label: criterion.label,
    browserInteractionObserved: false,
    requestCount: 0,
    method: 'POST' as const,
    sanitizedPath: sanitizePathname(`${canonicalStage01Path}/evaluations/${criterion.key}/revisions`),
    status: null,
    safeApiCode: null,
    canonicalGetAfterResponse: false,
    canonicalRevisionPresentAfterReload: null,
    canonicalGateStateAfterReload: null,
    operationBeforeAction: null,
  }))
  const proposalDiagnostic: ProposalCommandDiagnostic = {
    clickObserved: false,
    requestCount: 0,
    method: 'POST',
    sanitizedPath: sanitizePathname(`${canonicalStage01Path}/recommendations`),
    status: null,
    safeApiCode: null,
    canonicalGetAfterResponse: false,
    canonicalRevisionPresentAfterReload: null,
    canonicalGateStateAfterReload: null,
    operationBeforeAction: null,
    evaluationStateAfterReload: null,
  }
  let preDecisionDiagnostic: {
    sessionActorId: string
    actorCapabilities: string[]
    decisionControlVisible: boolean
    currentCycle: {
      version: number
      decisionAuthorityUserId: string | null
      authorityResolutionReferencePresent: boolean
      finalOutcomePresent: boolean
      finalRationalePresent: boolean
      overrideRationalePresent: boolean
    }
    evaluationGates: { satisfied: boolean, checks: Array<{ code: string, status: string }> }
  }
  const commandDiagnostics = [...criterionDiagnostics, proposalDiagnostic]
  const diagnosticByPath = new Map(commandDiagnostics.map(diagnostic => [diagnostic.sanitizedPath, diagnostic]))
  const onEvaluationCommandRequest = (request: Request): void => {
    const pathname = sanitizePathname(new URL(request.url()).pathname)
    const diagnostic = request.method() === 'POST' ? diagnosticByPath.get(pathname) : undefined
    if (!diagnostic) return
    diagnostic.operationBeforeAction = {
      previousCommandPending: commandDiagnostics.some(item => item.requestCount > 0 && item.status === null),
      previousReloadPending: commandDiagnostics.some(item => item.status !== null && !item.canonicalGetAfterResponse),
    }
    diagnostic.requestCount += 1
  }
  const onEvaluationCommandResponse = (response: Response): void => {
    const request = response.request()
    const pathname = sanitizePathname(new URL(response.url()).pathname)
    const diagnostic = request.method() === 'POST' ? diagnosticByPath.get(pathname) : undefined
    if (diagnostic) {
      diagnostic.status = response.status()
      if (response.status() >= 300) {
        void response.json().then(body => { diagnostic.safeApiCode = safeApiError(body).code }).catch(() => undefined)
      }
      return
    }
    if (request.method() !== 'GET' || pathname !== sanitizePathname(canonicalStage01Path)) return
    const completedCommand = [...commandDiagnostics].reverse().find(item => item.status !== null && !item.canonicalGetAfterResponse)
    if (!completedCommand) return
    completedCommand.canonicalGetAfterResponse = true
    void response.json().then(body => {
      const canonical = stage01OperationalDetailSchema.safeParse(body)
      if (!canonical.success) return
      for (const [index, criterion] of requiredCriteria.entries()) {
        const diagnostic = criterionDiagnostics[index]!
        diagnostic.canonicalRevisionPresentAfterReload = canonical.data.currentDecisionCycle.evaluations.some(evaluation => evaluation.criterionKey === criterion.key)
        diagnostic.canonicalGateStateAfterReload = {
          satisfied: canonical.data.evaluation.gates.satisfied,
          checks: canonical.data.evaluation.gates.checks.map(check => ({ code: check.code, status: check.status })),
        }
      }
      proposalDiagnostic.canonicalGateStateAfterReload = {
        satisfied: canonical.data.evaluation.gates.satisfied,
        checks: canonical.data.evaluation.gates.checks.map(check => ({ code: check.code, status: check.status })),
      }
      proposalDiagnostic.evaluationStateAfterReload = canonical.data.evaluation.runtime.state
    }).catch(() => undefined)
  }
  const evaluationDiagnosticSnapshot = () => ({
    criteria: criterionDiagnostics,
    proposal: proposalDiagnostic,
  })
  page.on('request', onEvaluationCommandRequest)
  page.on('response', onEvaluationCommandResponse)
  try {
    await evaluateRequiredCriteria(
      page,
      state,
      opportunityId,
      requiredCriteria.map(criterion => ({ key: criterion.key, label: criterion.label })),
      label => {
        const diagnostic = criterionDiagnostics.find(item => item.label === label)
        if (diagnostic) diagnostic.browserInteractionObserved = true
      },
    )
    await page.getByLabel('Lý do đề xuất').fill(runText(state, 'đề xuất tiếp tục'))
    await page.getByLabel('Bằng chứng đề xuất').fill(runText(state, 'bằng chứng đề xuất'))
    const proposalPath = `${canonicalStage01Path}/recommendations`
    const proposalResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === proposalPath
    })
    const proposalCanonicalReload = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === canonicalStage01Path
    })
    await page.getByRole('button', { name: 'Gửi đề xuất' }).click()
    proposalDiagnostic.clickObserved = true
    const response = await proposalResponse
    expect(response.status()).toBeGreaterThanOrEqual(200)
    expect(response.status()).toBeLessThan(300)
    const canonical = stage01OperationalDetailSchema.parse(await (await proposalCanonicalReload).json())
    expect(canonical.currentDecisionCycle.recommendations).not.toHaveLength(0)
    const authorityPath = `/api/companies/${state.companyId}/opportunities/${opportunityId}/decision-cycles/${canonical.currentDecisionCycle.id}/authority`
    const authorityPosts: string[] = []
    const onAuthorityRequest = (request: Request): void => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === authorityPath) authorityPosts.push(request.postData() ?? '')
    }
    page.on('request', onAuthorityRequest)
    try {
      const authorityResponse = page.waitForResponse(response => (
        response.request().method() === 'POST' && new URL(response.url()).pathname === authorityPath
      ))
      const authorityCanonicalReload = page.waitForResponse(response => (
        response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalStage01Path
      ))
      await page.getByRole('button', { name: 'Chỉ định', exact: true }).click()
      await page.getByRole('button', { name: 'Xác nhận chỉ định', exact: true }).click()
      expect((await authorityResponse).ok()).toBe(true)
      expect(authorityPosts).toHaveLength(1)
      const authorityCanonical = stage01OperationalDetailSchema.parse(await (await authorityCanonicalReload).json())
      expect(authorityCanonical.currentDecisionCycle.decisionAuthority).toMatchObject({
        status: 'resolved', userId: state.actors.decision.userId, currentActorIsAuthority: true,
      })
      expect(authorityCanonical.currentDecisionCycle.authorityResolutionEventId).not.toBeNull()
      expect(authorityCanonical.currentDecisionCycle.authorityResolutionReference)
        .toBe(authorityCanonical.currentDecisionCycle.authorityResolutionEventId)
      canonical.currentDecisionCycle = authorityCanonical.currentDecisionCycle
    } finally {
      page.off('request', onAuthorityRequest)
    }
    const preDecisionAggregate = {
      sessionActorId: state.actors.decision.userId,
      actorCapabilities: [...canonical.actorCapabilities].sort(),
      currentCycle: {
        version: canonical.currentDecisionCycle.version,
        decisionAuthorityUserId: canonical.currentDecisionCycle.decisionAuthorityUserId,
        authorityResolutionEventIdPresent: canonical.currentDecisionCycle.authorityResolutionEventId !== null,
        authorityResolutionReferencePresent: canonical.currentDecisionCycle.authorityResolutionReference !== null,
        finalOutcomePresent: canonical.currentDecisionCycle.finalOutcome !== null,
        finalRationalePresent: canonical.currentDecisionCycle.finalRationale !== null,
        overrideRationalePresent: canonical.currentDecisionCycle.overrideRationale !== null,
      },
      evaluationGates: {
        satisfied: canonical.evaluation.gates.satisfied,
        checks: canonical.evaluation.gates.checks.map(check => ({ code: check.code, status: check.status })),
      },
    }
    await expect(page.getByRole('button', { name: 'Ghi nhận quyết định' })).toBeVisible()
    preDecisionDiagnostic = { ...preDecisionAggregate, decisionControlVisible: true }
    console.log(`B4 Amendment 24 pre-decision diagnostic ${JSON.stringify({ ...evaluationDiagnosticSnapshot(), preDecision: preDecisionDiagnostic })}`)
  } catch (error) {
    const message = error instanceof Error ? safeDiagnosticText(error.message) : 'unknown evaluation/proposal failure'
    throw new Error(`B4 Amendment 24 pre-decision diagnostic: ${JSON.stringify({ message, ...evaluationDiagnosticSnapshot() })}`, { cause: error })
  } finally {
    page.off('request', onEvaluationCommandRequest)
    page.off('response', onEvaluationCommandResponse)
  }
  const decisionPath = `${canonicalStage01Path}/final-decision`
  const decisionDiagnostic = {
    preDecision: preDecisionDiagnostic,
    clickObserved: false,
    requestCount: 0,
    method: 'POST' as const,
    sanitizedPath: sanitizePathname(decisionPath),
    sanitizedRequestBody: null as {
      expectedCycleVersion: number | null
      outcome: 'proceed' | 'not_proceeding' | null
      rationale: 'present' | null
      overrideRationale: 'present' | null
    } | null,
    status: null as number | null,
    safeApiCode: null as string | null,
    canonicalGetAfterResponse: false,
    evaluationStateAfterReload: null as string | null,
    evaluationVersionAfterReload: null as number | null,
    finalDecisionGateAfterReload: null as string | null,
    completionCapabilityAfterReload: null as boolean | null,
  }
  const completionDiagnostic = {
    requestCount: 0,
    status: null as number | null,
    canonicalGetAfterResponse: false,
    canonicalState: null as string | null,
  }
  let completionPath: string | null = null
  let decisionPostAccepted = false
  let decisionCanonicalResponse: Response | null = null
  const onAmendment24Request = (request: Request): void => {
    const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === decisionPath) {
      decisionDiagnostic.requestCount += 1
      const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
      decisionDiagnostic.sanitizedRequestBody = {
        expectedCycleVersion: typeof body.expectedCycleVersion === 'number' ? body.expectedCycleVersion : null,
        outcome: body.outcome === 'proceed' || body.outcome === 'not_proceeding' ? body.outcome : null,
        rationale: typeof body.rationale === 'string' && body.rationale.length > 0 ? 'present' : null,
        overrideRationale: typeof body.overrideRationale === 'string' && body.overrideRationale.length > 0 ? 'present' : null,
      }
      return
    }
    if (completionPath !== null && request.method() === 'POST' && url.pathname === completionPath) {
      completionDiagnostic.requestCount += 1
    }
  }
  const onAmendment24Response = (response: Response): void => {
    const request = response.request()
    const url = new URL(response.url())
    if (request.method() === 'POST' && url.pathname === decisionPath) {
      decisionPostAccepted = response.ok()
      return
    }
    if (decisionPostAccepted && request.method() === 'GET' && url.pathname === canonicalStage01Path) {
      decisionCanonicalResponse = response
    }
  }
  page.on('request', onAmendment24Request)
  page.on('response', onAmendment24Response)
  try {
    await page.getByLabel('Lý do quyết định').fill(decisionRationale)
    const decisionResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === decisionPath
    })
    await page.getByRole('button', { name: 'Ghi nhận quyết định', exact: true }).click()
    decisionDiagnostic.clickObserved = true
    const response = await decisionResponse
    decisionDiagnostic.status = response.status()
    if (!response.ok()) {
      decisionDiagnostic.safeApiCode = safeApiError(await response.json().catch(() => null)).code
      throw new Error('B4 decision command returned a non-success status')
    }
    const canonicalResponse = decisionCanonicalResponse ?? await page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === canonicalStage01Path
    })
    expect(canonicalResponse.ok()).toBe(true)
    const decisionCanonicalDetail = stage01OperationalDetailSchema.parse(await canonicalResponse.json())
    decisionDiagnostic.canonicalGetAfterResponse = true
    decisionDiagnostic.evaluationStateAfterReload = decisionCanonicalDetail.evaluation.runtime.state
    decisionDiagnostic.evaluationVersionAfterReload = decisionCanonicalDetail.evaluation.runtime.version
    decisionDiagnostic.finalDecisionGateAfterReload = decisionCanonicalDetail.evaluation.gates.checks
      .find(check => check.code === 'FINAL_DECISION_RECORDED')?.status ?? null
    expect(decisionCanonicalDetail.currentDecisionCycle.finalOutcome).toBe('proceed')
    expect(decisionDiagnostic.finalDecisionGateAfterReload).toBe('satisfied')

    const postDecisionWorkflowRuntime = page.getByRole('region', {
      name: 'Điều hành node, phân công và blocker',
      exact: true,
    })
    const postDecisionEvaluation = postDecisionWorkflowRuntime.locator('article').filter({
      has: page.getByRole('heading', { name: '01.2 Đánh giá', exact: true }),
    })
    const completeEvaluationButton = postDecisionEvaluation.getByRole('button', { name: 'Hoàn tất node', exact: true })
    await expect(postDecisionEvaluation).toHaveCount(1)
    await expect(completeEvaluationButton).toBeEnabled()
    decisionDiagnostic.completionCapabilityAfterReload = true

    completionPath = `/api/companies/${state.companyId}/workflow-nodes/${decisionCanonicalDetail.evaluation.runtime.nodeExecutionId}/complete`
    const completionResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.pathname === completionPath
    })
    const completionCanonicalReload = page.waitForResponse(response => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === canonicalStage01Path
    })
    await completeEvaluationButton.click()
    const completion = await completionResponse
    completionDiagnostic.status = completion.status()
    expect(completion.ok()).toBe(true)
    const completionCanonicalResponse = await completionCanonicalReload
    expect(completionCanonicalResponse.ok()).toBe(true)
    const completionCanonicalDetail = stage01OperationalDetailSchema.parse(await completionCanonicalResponse.json())
    completionDiagnostic.canonicalGetAfterResponse = true
    completionDiagnostic.canonicalState = completionCanonicalDetail.evaluation.runtime.state
    expect(completionDiagnostic.canonicalState).toBe('completed')
    await expect(postDecisionWorkflowRuntime.getByText('Đã hoàn tất node.', { exact: true })).toBeVisible()
    console.log(`B4 Amendment 24 diagnostic ${JSON.stringify({ decision: decisionDiagnostic, evaluationCompletion: completionDiagnostic })}`)
  } catch (error) {
    const message = error instanceof Error ? safeDiagnosticText(error.message) : 'unknown decision/completion failure'
    throw new Error(`B4 Amendment 24 diagnostic: ${JSON.stringify({ message, decision: decisionDiagnostic, evaluationCompletion: completionDiagnostic })}`, { cause: error })
  } finally {
    page.off('request', onAmendment24Request)
    page.off('response', onAmendment24Response)
  }

  await page.reload()
  await expect(runtimeNode(page, '01.1 Tiếp nhận')).toContainText('Trạng thái: completed')
  await expect(runtimeNode(page, '01.2 Đánh giá')).toContainText('Trạng thái: completed')
  await expect(page.getByText('Quyết định đã ghi nhận: Tiếp tục', { exact: false })).toBeVisible()
  await expect(page.getByText(`Chu kỳ #1 · Đã hoàn tất`, { exact: true })).toBeVisible()
  await expect(page.getByText(decisionRationale, { exact: false })).toBeVisible()

  // B4-S08: the operator is still the real decision-capable browser actor; a new cycle is appended,
  // while the prior decision remains visible after canonical reload.
  await page.getByRole('button', { name: 'Kích hoạt lại Stage 01' }).click()
  await page.getByLabel('Lý do kích hoạt lại').fill(reactivationReason)
  await page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).click()
  await page.reload()
  await expect(page.getByText('Chu kỳ #1 · Đã hoàn tất', { exact: true })).toBeVisible()
  await expect(page.getByText('Chu kỳ #2 · Đang xử lý', { exact: true })).toBeVisible()
  await expect(page.getByText(`Kích hoạt lại: ${reactivationReason}`, { exact: true })).toBeVisible()
  await expect(page.getByText(decisionRationale, { exact: false })).toBeVisible()

  const canonical = await authenticatedApi(page, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`)
  expect(canonical.status).toBe(200)
  expect(canonical.body).toMatchObject({
    opportunity: { id: opportunityId, primaryCustomerName: opportunityName },
    currentDecisionCycle: {
      cycleNo: 2,
      finalOutcome: null,
      reactivationReason,
      decisionAuthorityUserId: null,
      authorityResolutionEventId: null,
      authorityResolutionReference: null,
      decisionAuthority: { status: 'unresolved', userId: null },
    },
    decisionCycles: expect.arrayContaining([
      expect.objectContaining({ cycleNo: 1, finalOutcome: 'proceed', finalRationale: decisionRationale }),
      expect.objectContaining({
        cycleNo: 2,
        finalOutcome: null,
        reactivationReason,
        decisionAuthorityUserId: null,
        authorityResolutionEventId: null,
        authorityResolutionReference: null,
        decisionAuthority: expect.objectContaining({ status: 'unresolved', userId: null }),
      }),
    ]),
  })
})

test('B4-S07 rejects a stale Opportunity form and saves the retained edit only after canonical reload', async ({ browser }) => {
  const state = await readB4AcceptanceState(process.cwd())
  const actor = state.actors.operator
  const opportunityName = runText(state, 'S07 concurrency opportunity')
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()
  let bRequestListener: ((request: Request) => void) | null = null

  try {
    await login(pageA, actor)
    await pageA.goto('/opportunities')
    const createOptions = await authenticatedApi(pageA, `/api/companies/${state.companyId}/opportunities/create-options`)
    expect(createOptions.status).toBe(200)
    expect((createOptions.body as { publishedSnapshotId?: unknown }).publishedSnapshotId).toBe(state.acceptanceSnapshotId)
    await pageA.getByRole('button', { name: 'Tạo cơ hội mới' }).click()
    await pageA.getByLabel('Tên khách hàng chính').fill(opportunityName)
    const initialNeed = runText(state, 'S07 nhu cầu ban đầu')
    await pageA.getByLabel('Nhu cầu').fill(initialNeed)
    await chooseFirstRealOption(pageA, 'Loại khách hàng')
    await chooseFirstRealOption(pageA, 'Nguồn khách hàng')
    await chooseFirstRealOption(pageA, 'Mức độ tương tác')

    const createPath = `/api/companies/${state.companyId}/opportunities`
    const createResponsePromise = pageA.waitForResponse(response => (
      response.request().method() === 'POST' && new URL(response.url()).pathname === createPath
    ))
    const initialStage01ResponsePromise = pageA.waitForResponse(response => {
      const pathname = new URL(response.url()).pathname
      return response.request().method() === 'GET'
        && pathname.startsWith(`${createPath}/`)
        && pathname.endsWith('/stage-01')
    })
    await pageA.getByRole('button', { name: 'Tạo cơ hội' }).click()
    const createResponse = await createResponsePromise
    const initialStage01Response = await initialStage01ResponsePromise
    expect(createResponse.status()).toBeGreaterThanOrEqual(200)
    expect(createResponse.status()).toBeLessThan(300)
    expect(JSON.parse(createResponse.request().postData() ?? '{}')).toMatchObject({
      primaryCustomerName: opportunityName,
      needDescription: initialNeed,
    })
    await expect(pageA).toHaveURL(/\/opportunities\/[0-9a-f-]+\/stage-01$/i)
    const opportunityId = pageA.url().match(/\/opportunities\/([^/]+)\/stage-01$/u)?.[1]
    if (!opportunityId) throw new Error('B4 S07 opportunity URL did not contain an identifier')
    const canonicalPath = `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`
    const opportunityPath = `/api/companies/${state.companyId}/opportunities/${opportunityId}`
    expect(new URL(initialStage01Response.url()).pathname).toBe(canonicalPath)
    const initialDetail = stage01OperationalDetailSchema.parse(await initialStage01Response.json())
    const versionN = initialDetail.opportunity.version
    expect(initialDetail.opportunity.primaryCustomerName).toBe(opportunityName)

    await login(pageB, actor)
    const bInitialStage01ResponsePromise = pageB.waitForResponse(response => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
    ))
    await pageB.goto(`/opportunities/${opportunityId}/stage-01`)
    const bInitialDetail = stage01OperationalDetailSchema.parse(await (await bInitialStage01ResponsePromise).json())
    expect(bInitialDetail.opportunity.version).toBe(versionN)

    await pageA.getByRole('button', { name: 'Chỉnh sửa cơ hội', exact: true }).click()
    await pageB.getByRole('button', { name: 'Chỉnh sửa cơ hội', exact: true }).click()
    const aName = `${opportunityName} A`
    const bDraftName = `${opportunityName} B retained draft`
    const aNameInput = pageA.getByRole('textbox', { name: 'Tên khách hàng chính', exact: true })
    const bNameInput = pageB.getByRole('textbox', { name: 'Tên khách hàng chính', exact: true })
    await expect(aNameInput).toHaveValue(opportunityName)
    await expect(bNameInput).toHaveValue(opportunityName)
    await aNameInput.fill(aName)
    await bNameInput.fill(bDraftName)

    const aPatchResponsePromise = pageA.waitForResponse(response => (
      response.request().method() === 'PATCH' && new URL(response.url()).pathname === opportunityPath
    ))
    const aCanonicalResponsePromise = pageA.waitForResponse(response => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
    ))
    await pageA.getByRole('button', { name: 'Lưu cơ hội', exact: true }).click()
    const aPatchResponse = await aPatchResponsePromise
    const aCanonicalResponse = await aCanonicalResponsePromise
    expect(aPatchResponse.status()).toBeGreaterThanOrEqual(200)
    expect(aPatchResponse.status()).toBeLessThan(300)
    expect(JSON.parse(aPatchResponse.request().postData() ?? '{}')).toMatchObject({
      primaryCustomerName: aName,
      expectedOpportunityVersion: versionN,
    })
    expect(aCanonicalResponse.status()).toBe(200)
    const aCanonicalDetail = stage01OperationalDetailSchema.parse(await aCanonicalResponse.json())
    expect(aCanonicalDetail.opportunity.version).toBe(versionN + 1)
    expect(aCanonicalDetail.opportunity.primaryCustomerName).toBe(aName)
    await expect(pageA.getByText('Đã lưu thông tin cơ hội chính tắc.', { exact: true })).toBeVisible()
    await expect(aNameInput).toHaveCount(0)

    const bPatchRequests: Record<string, unknown>[] = []
    bRequestListener = request => {
      if (request.method() !== 'PATCH' || new URL(request.url()).pathname !== opportunityPath) return
      bPatchRequests.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>)
    }
    pageB.on('request', bRequestListener)
    const bConflictResponsePromise = pageB.waitForResponse(response => (
      response.request().method() === 'PATCH' && new URL(response.url()).pathname === opportunityPath
    ))
    await pageB.getByRole('button', { name: 'Lưu cơ hội', exact: true }).click()
    const bConflictResponse = await bConflictResponsePromise
    expect(bConflictResponse.status()).toBe(409)
    expect(apiErrorBodySchema.parse(await bConflictResponse.json()).error.code).toBe('VERSION_CONFLICT')
    expect(bPatchRequests).toHaveLength(1)
    expect(bPatchRequests[0]).toMatchObject({
      primaryCustomerName: bDraftName,
      expectedOpportunityVersion: versionN,
    })
    await expect(bNameInput).toHaveValue(bDraftName)
    await expect(pageB.getByRole('button', { name: 'Giữ bản nháp để xem', exact: true })).toBeVisible()
    await pageB.getByRole('button', { name: 'Giữ bản nháp để xem', exact: true }).click()
    await expect(pageB.getByText('Bản nháp chỉ dùng để xem. Hãy bỏ bản nháp và tải lại trước khi lưu tiếp.', { exact: true })).toBeVisible()
    await expect(pageB.getByRole('button', { name: 'Lưu cơ hội', exact: true })).toBeDisabled()
    await expect.poll(() => bPatchRequests.length).toBe(1)

    const aReadback = await authenticatedApi(pageA, canonicalPath)
    expect(aReadback.status).toBe(200)
    const aReadbackDetail = stage01OperationalDetailSchema.parse(aReadback.body)
    expect(aReadbackDetail.opportunity.version).toBe(versionN + 1)
    expect(aReadbackDetail.opportunity.primaryCustomerName).toBe(aName)

    const bDiscardReloadPromise = pageB.waitForResponse(response => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
    ))
    await pageB.getByRole('button', { name: 'Bỏ bản nháp và tải lại', exact: true }).click()
    const bReloadResponse = await bDiscardReloadPromise
    expect(bReloadResponse.status()).toBe(200)
    const bReloadDetail = stage01OperationalDetailSchema.parse(await bReloadResponse.json())
    expect(bReloadDetail.opportunity.version).toBe(versionN + 1)
    expect(bReloadDetail.opportunity.primaryCustomerName).toBe(aName)
    await expect(bNameInput).toHaveValue(aName)

    const bFreshName = `${opportunityName} B saved after reload`
    await bNameInput.fill(bFreshName)
    const bFreshPatchResponsePromise = pageB.waitForResponse(response => (
      response.request().method() === 'PATCH' && new URL(response.url()).pathname === opportunityPath
    ))
    const bFreshCanonicalResponsePromise = pageB.waitForResponse(response => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === canonicalPath
    ))
    await pageB.getByRole('button', { name: 'Lưu cơ hội', exact: true }).click()
    const bFreshPatchResponse = await bFreshPatchResponsePromise
    const bFreshCanonicalResponse = await bFreshCanonicalResponsePromise
    expect(bFreshPatchResponse.status()).toBeGreaterThanOrEqual(200)
    expect(bFreshPatchResponse.status()).toBeLessThan(300)
    expect(JSON.parse(bFreshPatchResponse.request().postData() ?? '{}')).toMatchObject({
      primaryCustomerName: bFreshName,
      expectedOpportunityVersion: versionN + 1,
    })
    expect(bPatchRequests).toHaveLength(2)
    expect(bFreshCanonicalResponse.status()).toBe(200)
    const bFreshCanonicalDetail = stage01OperationalDetailSchema.parse(await bFreshCanonicalResponse.json())
    expect(bFreshCanonicalDetail.opportunity.version).toBe(versionN + 2)
    expect(bFreshCanonicalDetail.opportunity.primaryCustomerName).toBe(bFreshName)
    expect([versionN, aCanonicalDetail.opportunity.version, aReadbackDetail.opportunity.version, bReloadDetail.opportunity.version, bFreshCanonicalDetail.opportunity.version])
      .toEqual([versionN, versionN + 1, versionN + 1, versionN + 1, versionN + 2])
  } finally {
    if (bRequestListener) pageB.off('request', bRequestListener)
    await contextB.close().catch(() => undefined)
    await contextA.close().catch(() => undefined)
  }
})

test('B4-S09 keeps reader/operator mutations denied and rejects forged-company and invalid bearer API calls', async ({ browser }) => {
  const state = await readB4AcceptanceState(process.cwd())
  const opportunityId = state.profiles.p1OpportunityId
  const stagePath = `/opportunities/${opportunityId}/stage-01`

  const readerContext = await browser.newContext()
  const readerPage = await readerContext.newPage()
  try {
    await login(readerPage, state.actors.reader)
    await readerPage.goto(stagePath)
    await expect(readerPage.getByRole('heading', { name: 'Điều hành node, phân công và blocker' })).toBeVisible()
    await expect(readerPage.getByRole('button', { name: /^(Chỉnh sửa cơ hội|Thêm liên hệ|Thêm phạm vi|Thêm người giới thiệu|Ghi nhận tiếp nhận|Phân công|Nêu blocker|Gửi đề xuất|Ghi nhận quyết định|Kích hoạt lại Stage 01)$/ })).toHaveCount(0)
  } finally {
    await readerContext.close()
  }

  const operatorContext = await browser.newContext()
  const operatorPage = await operatorContext.newPage()
  try {
    await login(operatorPage, state.actors.operator)
    await operatorPage.goto(stagePath)
    await expect(operatorPage.getByRole('button', { name: 'Ghi nhận quyết định' })).toHaveCount(0)
    await expect(operatorPage.getByRole('button', { name: 'Kích hoạt lại Stage 01' })).toHaveCount(0)

    const detail = await authenticatedApi(operatorPage, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`)
    expect(detail.status).toBe(200)
    const cycle = (detail.body as { currentDecisionCycle: { version: number }, opportunity: { version: number }, evaluation: { runtime: { version: number } } }).currentDecisionCycle
    const decisionDenied = await authenticatedApi(operatorPage, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01/final-decision`, 'POST', {
      outcome: 'proceed', rationale: runText(state, 'operator denied decision'), expectedCycleVersion: cycle.version,
    })
    expect(decisionDenied.status).toBe(403)
    const reactivationDenied = await authenticatedApi(operatorPage, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01/reactivate`, 'POST', {
      reason: runText(state, 'operator denied reactivation'), expectedOpportunityVersion: (detail.body as { opportunity: { version: number } }).opportunity.version,
      expectedExecutionVersion: (detail.body as { evaluation: { runtime: { version: number } } }).evaluation.runtime.version,
      expectedCycleVersion: cycle.version,
    })
    expect(reactivationDenied.status).toBe(403)

    const canonicalCompany = await authenticatedApi(operatorPage, `/api/companies/${canonicalVqhCompanyId}/opportunities/${opportunityId}/stage-01`)
    expect(canonicalCompany.status).toBe(403)
    const invalidBearer = await unauthenticatedApi(operatorPage, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`, 'not-a-jwt')
    const expiredBearer = await unauthenticatedApi(operatorPage, `/api/companies/${state.companyId}/opportunities/${opportunityId}/stage-01`, 'eyJhbGciOiJub25lIn0.eyJleHAiOjF9.')
    expect(invalidBearer.status).toBe(401)
    expect(expiredBearer.status).toBe(401)
    expect(invalidBearer.body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: expect.any(String) }) }))
    expect(expiredBearer.body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: expect.any(String) }) }))
  } finally {
    await operatorContext.close()
  }
})
