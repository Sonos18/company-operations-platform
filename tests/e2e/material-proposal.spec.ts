import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  materialProposalViewSchema,
  materialProposalInputSchema,
  updateMaterialProposalInputSchema,
  materialProposalCommandVersionSchema,
  createMaterialInputSchema,
  updateMaterialInputSchema,
  type MaterialProjectOption,
  type MaterialView,
  type MaterialProposalView,
} from '../../shared/schemas/costs/material-procurement'

const engineerId = '11111111-1111-4111-8111-111111111111'
const otherEngineerId = '33333333-3333-4333-8333-333333333333'

const company1Id = '10000000-0000-4000-8000-000000000002'
const company2Id = '10000000-0000-4000-8000-000000000099'

const projectId = '30000000-0000-4000-8000-000000000001'
const project2Id = '30000000-0000-4000-8000-000000000002'
const company2ProjectId = '30000000-0000-4000-8000-000000000099'

const material1Id = '40000000-0000-4000-8000-000000000001'
const material2Id = '40000000-0000-4000-8000-000000000002'

const proposalId = '50000000-0000-4000-8000-000000000001'
const line1Id = '60000000-0000-4000-8000-000000000001'

interface CapturedRequest {
  method: string
  url: string
  body: unknown
  headers: Record<string, string>
}

const mockProjectsCompany1: MaterialProjectOption[] = [
  {
    projectId,
    code: 'DA-VQH-01',
    name: 'Công trình Tòa nhà VQH',
    locationText: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
  },
  {
    projectId: project2Id,
    code: 'DA-VQH-02',
    name: 'Công trình Nhà máy KCN',
    locationText: 'Khu công nghiệp Hiệp Phước, Nhà Bè, TP.HCM',
  },
]

const mockProjectsCompany2: MaterialProjectOption[] = [
  {
    projectId: company2ProjectId,
    code: 'DA-KD-01',
    name: 'Công trình Biệt thự Khang Điền',
    locationText: 'Số 88 Mai Chí Thọ, TP. Thủ Đức',
  },
]

const mockMaterials: MaterialView[] = [
  {
    id: material1Id,
    code: 'VT-THEP-08',
    name: 'Thép cuộn phi 8',
    specification: 'Mác thép CB240-T, TCVN 1651-1:2018',
    unit: 'kg',
    isActive: true,
    version: 1,
  },
  {
    id: material2Id,
    code: 'VT-XM-PCB40',
    name: 'Xi măng PCB40',
    specification: 'Bao 50kg, đạt chuẩn Vicem Hà Tiên',
    unit: 'bao',
    isActive: true,
    version: 1,
  },
]

function createMockProposal(overrides: Partial<MaterialProposalView> = {}): MaterialProposalView {
  const base = {
    id: proposalId,
    version: 1,
    reviewState: 'draft' as const,
    returnReason: null,
    approvedRevisionId: null,
    projectId,
    createdBy: engineerId,
    neededOn: '2026-10-30',
    deliveryAddress: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
    notes: 'Giao trong giờ hành chính',
    lines: [
      {
        lineId: line1Id,
        materialId: material1Id,
        materialName: 'Thép cuộn phi 8',
        specification: 'Mác thép CB240-T, TCVN 1651-1:2018',
        unit: 'kg',
        quantity: '20.0000',
        allocatedQuantity: '0.0000',
        signedQuantity: '0.0000',
        remainingQuantity: '20.0000',
      },
    ],
    orderProgress: {
      orderCount: 0,
      signedOrderCount: 0,
    },
  }
  return materialProposalViewSchema.parse({ ...base, ...overrides })
}

interface MockRouteOptions {
  currentProposal?: MaterialProposalView
  failWith409OnUpdate?: boolean
  failWith403OnSubmit?: boolean
  loseFirstMasterPostResponse?: boolean
  loseFirstProposalPatchResponse?: boolean
  loseFirstProposalSubmitResponse?: boolean
  capturedRequests?: CapturedRequest[]
}

async function setupMaterialMocks(page: Page, options: MockRouteOptions = {}) {
  const captured = options.capturedRequests || []
  let activeProposal: MaterialProposalView = options.currentProposal || createMockProposal()
  const receipts = new Map<string, { bodyString: string, response: unknown }>()
  const materialsState = [...mockMaterials]
  let loseFirstMasterPostResponse = options.loseFirstMasterPostResponse ?? false
  let loseFirstProposalPatchResponse = options.loseFirstProposalPatchResponse ?? false
  let loseFirstProposalSubmitResponse = options.loseFirstProposalSubmitResponse ?? false

  // Master: Projects
  await page.route(/\/api\/companies\/([^/]+)\/material-procurement\/projects$/, async (route: Route) => {
    const match = route.request().url().match(/\/api\/companies\/([^/]+)\/material-procurement\/projects$/)
    const companyId = match ? match[1] : ''
    if (companyId === company2Id) {
      await route.fulfill({ json: mockProjectsCompany2 })
    } else {
      await route.fulfill({ json: mockProjectsCompany1 })
    }
  })

  // Master: Materials
  await page.route(/\/api\/companies\/[^/]+\/material-procurement\/materials$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ json: materialsState })
      return
    }

    if (req.method() === 'POST') {
      const rawBody = req.postDataJSON()
      const parsedBody = createMaterialInputSchema.parse(rawBody)
      const idempotencyKey = req.headers()['idempotency-key'] || ''

      captured.push({
        method: req.method(),
        url: req.url(),
        body: parsedBody,
        headers: req.headers(),
      })

      const receiptKey = idempotencyKey
      const bodyStr = JSON.stringify(parsedBody)
      const cached = receipts.get(receiptKey)

      if (cached) {
        if (cached.bodyString === bodyStr) {
          await route.fulfill({ json: { ...(cached.response as object), replayed: true } })
          return
        }
        await route.fulfill({
          status: 409,
          json: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Trùng idempotency key với payload khác' } },
        })
        return
      }

      const newId = crypto.randomUUID()
      const newMaterial: MaterialView = {
        id: newId,
        code: parsedBody.code,
        name: parsedBody.name,
        specification: parsedBody.specification,
        unit: parsedBody.unit,
        isActive: true,
        version: 1,
      }
      materialsState.push(newMaterial)

      const responsePayload = { resourceId: newId, version: 1, replayed: false }
      receipts.set(receiptKey, { bodyString: bodyStr, response: responsePayload })
      if (loseFirstMasterPostResponse) {
        loseFirstMasterPostResponse = false
        await route.abort('failed')
        return
      }
      await route.fulfill({ json: responsePayload })
      return
    }

    await route.abort()
  })

  // Master: Material Update
  await page.route(/\/api\/companies\/[^/]+\/material-procurement\/materials\/[^/]+$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'PATCH') {
      const rawBody = req.postDataJSON()
      const parsedBody = updateMaterialInputSchema.parse(rawBody)
      const idempotencyKey = req.headers()['idempotency-key'] || ''

      captured.push({
        method: req.method(),
        url: req.url(),
        body: parsedBody,
        headers: req.headers(),
      })

      const receiptKey = idempotencyKey
      const bodyStr = JSON.stringify(parsedBody)
      const cached = receipts.get(receiptKey)

      if (cached) {
        if (cached.bodyString === bodyStr) {
          await route.fulfill({ json: { ...(cached.response as object), replayed: true } })
          return
        }
        await route.fulfill({
          status: 409,
          json: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Trùng idempotency key với payload khác' } },
        })
        return
      }

      const responsePayload = { resourceId: material1Id, version: parsedBody.expectedVersion + 1, replayed: false }
      receipts.set(receiptKey, { bodyString: bodyStr, response: responsePayload })
      await route.fulfill({ json: responsePayload })
      return
    }
    await route.abort()
  })

  // Proposals: List & Create
  await page.route(/\/api\/companies\/[^/]+\/projects\/([^/]+)\/material-procurement\/proposals$/, async (route: Route) => {
    const req = route.request()
    const match = req.url().match(/\/api\/companies\/[^/]+\/projects\/([^/]+)\/material-procurement\/proposals$/)
    const currentRouteProjectId = match ? match[1] : projectId

    if (req.method() === 'GET') {
      if (activeProposal.projectId === currentRouteProjectId) {
        await route.fulfill({ json: [activeProposal] })
      } else {
        await route.fulfill({ json: [] })
      }
      return
    }

    if (req.method() === 'POST') {
      const rawBody = req.postDataJSON()
      const parsedBody = materialProposalInputSchema.parse(rawBody)
      const idempotencyKey = req.headers()['idempotency-key'] || ''

      captured.push({
        method: req.method(),
        url: req.url(),
        body: parsedBody,
        headers: req.headers(),
      })

      const receiptKey = idempotencyKey
      const bodyStr = JSON.stringify(parsedBody)
      const cached = receipts.get(receiptKey)

      if (cached) {
        if (cached.bodyString === bodyStr) {
          await route.fulfill({ json: { ...(cached.response as object), replayed: true } })
          return
        }
        await route.fulfill({
          status: 409,
          json: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Trùng idempotency key với payload khác' } },
        })
        return
      }

      const createdProposalId = proposalId
      activeProposal = createMockProposal({
        id: createdProposalId,
        projectId: currentRouteProjectId,
        version: 1,
        neededOn: parsedBody.neededOn,
        deliveryAddress: parsedBody.deliveryAddress,
        notes: parsedBody.notes || null,
        lines: parsedBody.lines.map((l) => ({
          lineId: l.lineId,
          materialId: l.materialId,
          materialName: mockMaterials.find(m => m.id === l.materialId)?.name || 'Vật tư',
          specification: mockMaterials.find(m => m.id === l.materialId)?.specification || 'Quy cách',
          unit: mockMaterials.find(m => m.id === l.materialId)?.unit || 'đơn vị',
          quantity: l.quantity,
          allocatedQuantity: '0.0000',
          signedQuantity: '0.0000',
          remainingQuantity: l.quantity,
        })),
      })

      const responsePayload = {
        resourceId: createdProposalId,
        version: 1,
        replayed: false,
      }
      receipts.set(receiptKey, { bodyString: bodyStr, response: responsePayload })
      await route.fulfill({ json: responsePayload })
      return
    }

    await route.abort()
  })

  // Proposals: Read & Update
  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/proposals\/([^/]+)$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ json: activeProposal })
      return
    }

    if (req.method() === 'PATCH') {
      const rawBody = req.postDataJSON()
      const parsedBody = updateMaterialProposalInputSchema.parse(rawBody)
      const idempotencyKey = req.headers()['idempotency-key'] || ''

      captured.push({
        method: req.method(),
        url: req.url(),
        body: parsedBody,
        headers: req.headers(),
      })

      const receiptKey = idempotencyKey
      const bodyStr = JSON.stringify(parsedBody)
      const cached = receipts.get(receiptKey)

      if (cached) {
        if (cached.bodyString === bodyStr) {
          await route.fulfill({ json: { ...(cached.response as object), replayed: true } })
          return
        }
        await route.fulfill({
          status: 409,
          json: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Trùng idempotency key với payload khác' } },
        })
        return
      }

      if (options.failWith409OnUpdate || parsedBody.expectedVersion !== activeProposal.version) {
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Phiên bản không khớp (xung đột dữ liệu).',
              requestId: 'mock-req-409',
              details: {},
            },
          },
        })
        return
      }

      activeProposal = createMockProposal({
        ...activeProposal,
        version: activeProposal.version + 1,
        neededOn: parsedBody.neededOn,
        deliveryAddress: parsedBody.deliveryAddress,
        notes: parsedBody.notes || null,
        lines: parsedBody.lines.map((l) => ({
          lineId: l.lineId,
          materialId: l.materialId,
          materialName: mockMaterials.find(m => m.id === l.materialId)?.name || 'Vật tư',
          specification: mockMaterials.find(m => m.id === l.materialId)?.specification || 'Quy cách',
          unit: mockMaterials.find(m => m.id === l.materialId)?.unit || 'đơn vị',
          quantity: l.quantity,
          allocatedQuantity: '0.0000',
          signedQuantity: '0.0000',
          remainingQuantity: l.quantity,
        })),
      })

      const responsePayload = {
        resourceId: proposalId,
        version: activeProposal.version,
        replayed: false,
      }
      receipts.set(receiptKey, { bodyString: bodyStr, response: responsePayload })
      if (loseFirstProposalPatchResponse) {
        loseFirstProposalPatchResponse = false
        await route.abort('failed')
        return
      }
      await route.fulfill({ json: responsePayload })
      return
    }

    await route.abort()
  })

  // Proposals: Submit
  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/proposals\/[^/]+\/submit$/, async (route: Route) => {
    const req = route.request()
    const rawBody = req.postDataJSON()
    const parsedBody = materialProposalCommandVersionSchema.parse(rawBody)
    const idempotencyKey = req.headers()['idempotency-key'] || ''

    captured.push({
      method: req.method(),
      url: req.url(),
      body: parsedBody,
      headers: req.headers(),
    })

    if (options.failWith403OnSubmit) {
      await route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Bạn không có quyền gửi phiếu yêu cầu mua hàng.',
            requestId: 'mock-req-403',
            details: {},
          },
        },
      })
      return
    }

    const receiptKey = idempotencyKey
    const bodyStr = JSON.stringify(parsedBody)
    const cached = receipts.get(receiptKey)

    if (cached) {
      if (cached.bodyString === bodyStr) {
        await route.fulfill({ json: { ...(cached.response as object), replayed: true } })
        return
      }
      await route.fulfill({
        status: 409,
        json: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Trùng idempotency key khi submit' } },
      })
      return
    }

    if (parsedBody.expectedVersion !== activeProposal.version) {
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Phiên bản không khớp khi gửi duyệt.',
          },
        },
      })
      return
    }

    activeProposal = createMockProposal({
      ...activeProposal,
      version: activeProposal.version + 1,
      reviewState: 'submitted',
      returnReason: null,
    })

    const responsePayload = {
      resourceId: proposalId,
      version: activeProposal.version,
      replayed: false,
      reviewState: 'submitted',
    }
    receipts.set(receiptKey, { bodyString: bodyStr, response: responsePayload })
    if (loseFirstProposalSubmitResponse) {
      loseFirstProposalSubmitResponse = false
      await route.abort('failed')
      return
    }
    await route.fulfill({ json: responsePayload })
  })

  return {
    getCaptured: () => captured,
    getActiveProposal: () => activeProposal,
    getMaterials: () => materialsState,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}

async function selectCompany(page: Page, companyId: string) {
  await page.evaluate((target) => {
    const root = document.querySelector('#__nuxt') as HTMLElement & {
      __vue_app__?: { config: { globalProperties: {
        $nuxt?: { $companyAccessStore?: { selectCompany(id: string): boolean } }
      } } }
    }
    if (!root.__vue_app__?.config.globalProperties.$nuxt?.$companyAccessStore?.selectCompany(target)) {
      throw new Error('Unable to switch company')
    }
  }, companyId)
}

async function setupTwoCompanies(page: Page, options: MockRouteOptions = {}) {
  await installAuthRoutes(page, createAuthTestState({
    sessionCompanies: [
      createCompany({ companyId: company1Id, companyName: 'Công ty VQH' }),
      createCompany({ companyId: company2Id, companyName: 'Công ty Khang Điền' }),
    ],
  }))
  return setupMaterialMocks(page, options)
}

async function holdJsonResponse(page: Page, pattern: RegExp, body: unknown) {
  const entered = deferred()
  const released = deferred()
  await page.route(pattern, async route => {
    entered.resolve()
    await released.promise
    await route.fulfill({ json: body })
  })
  return { entered: entered.promise, release: released.resolve }
}

async function navigateWithinApp(page: Page, path: string) {
  await page.evaluate(async target => {
    const root = document.querySelector('#__nuxt') as HTMLElement & {
      __vue_app__?: { config: { globalProperties: { $router?: { push(path: string): Promise<unknown> } } } }
    }
    const router = root.__vue_app__?.config.globalProperties.$router
    if (!router) throw new Error('Unable to resolve router')
    await router.push(target)
  }, path)
}

test.describe('AGY — T5 UI Kỹ sư yêu cầu vật tư (Đóng 8 finding review)', () => {
  test('1. Địa chỉ mặc định từ project nạp vào Nơi giao; sửa nơi giao không đổi địa chỉ project', async ({ page }) => {
    await setupMaterialMocks(page)

    await page.goto(`/materials/${projectId}/proposals/new`)

    // Address is prefilled from project's locationText
    const deliveryInput = page.getByLabel('Nơi giao hàng')
    await expect(deliveryInput).toHaveValue('123 Đường Nguyễn Huệ, Quận 1, TP.HCM')

    // Edit delivery address
    await deliveryInput.fill('Cổng số 2 - Công trường VQH Thủ Đức')
    await expect(deliveryInput).toHaveValue('Cổng số 2 - Công trường VQH Thủ Đức')

    // Project master location in hint remains unchanged
    await expect(page.getByText('Địa chỉ dự án: 123 Đường Nguyễn Huệ, Quận 1, TP.HCM')).toBeVisible()
  })

  test('2. Engineer lập draft -> Lưu nháp -> Gửi mua hàng -> DOM hiển thị "Đã gửi", khóa form khi in-flight', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, { capturedRequests })

    await page.goto(`/materials/${projectId}/proposals/new`)

    // Fill date
    await page.getByLabel('Ngày cần vật tư').fill('2026-10-30')

    // Fill delivery address
    await page.getByLabel('Nơi giao hàng').fill('Kho vật tư công trường VQH')

    // Select material
    const materialSelect = page.locator('select.line-select').first()
    await materialSelect.selectOption(material1Id)

    // Fill positive quantity decimal
    const qtyInput = page.locator('input.quantity-input').first()
    await qtyInput.fill('25.5000')

    // Click "Lưu nháp"
    const saveButton = page.getByRole('button', { name: 'Lưu nháp' })
    await saveButton.click()

    // Verifies navigation to proposal detail
    await expect(page).toHaveURL(new RegExp(`/materials/${projectId}/proposals/${proposalId}`))

    // Verify POST createProposal was dispatched with parsed schema and idempotency key
    const createReq = capturedRequests.find(r => r.method === 'POST' && r.url.endsWith('/proposals'))
    expect(createReq).toBeDefined()
    expect(createReq?.headers['idempotency-key']).toBeTruthy()
    const createBody = createReq?.body as { lines: Array<{ quantity: string }> }
    expect(createBody.lines[0].quantity).toBe('25.5000')

    // Click "Gửi mua hàng"
    const submitButton = page.getByRole('button', { name: 'Gửi mua hàng' })
    await submitButton.click()

    // Verify submit endpoint called
    const submitReq = capturedRequests.find(r => r.url.endsWith('/submit'))
    expect(submitReq).toBeDefined()
    expect(submitReq?.headers['idempotency-key']).toBeTruthy()

    // DOM displays "Đã gửi" status badge
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()
  })

  test('3. Returned Save rồi Submit không PATCH thừa khi không dirty; test receipt-aware retry/lost response', async ({ page }) => {
    const returnedProposal = createMockProposal({
      reviewState: 'returned',
      returnReason: 'Vui lòng tăng khối lượng thép cuộn lên 40kg theo tiến độ đổ sàn.',
      lines: [
        {
          lineId: line1Id,
          materialId: material1Id,
          materialName: 'Thép cuộn phi 8',
          specification: 'Mác thép CB240-T, TCVN 1651-1:2018',
          unit: 'kg',
          quantity: '20.0000',
          allocatedQuantity: '0.0000',
          signedQuantity: '0.0000',
          remainingQuantity: '20.0000',
        },
      ],
    })

    const capturedRequests: CapturedRequest[] = []
    const mock = await setupMaterialMocks(page, {
      currentProposal: returnedProposal,
      capturedRequests,
    })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    await expect(page.getByLabel('Nơi giao hàng')).toBeVisible()
    const canonicalGetEntered = deferred()
    const releaseCanonicalGet = deferred()
    let detailReads = 0
    await page.route(new RegExp(`/api/companies/[^/]+/projects/${projectId}/material-procurement/proposals/${proposalId}$`), async route => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      detailReads++
      const snapshot = mock.getActiveProposal()
      if (detailReads === 1) {
        canonicalGetEntered.resolve()
        await releaseCanonicalGet.promise
      }
      await route.fulfill({ json: snapshot })
    })

    // Verify returnReason banner is displayed prominently
    await expect(page.getByText('Vui lòng tăng khối lượng thép cuộn lên 40kg theo tiến độ đổ sàn.')).toBeVisible()

    // Engineer edits quantity to 40.0000
    const qtyInput = page.locator('input.quantity-input').first()
    await qtyInput.fill('40.0000')

    // Engineer clicks "Lưu nháp"
    await page.getByRole('button', { name: 'Lưu nháp' }).click()
    await canonicalGetEntered.promise
    await expect(page.getByText('Đã lưu nháp phiếu yêu cầu thành công.')).toBeVisible()

    const patchCountAfterSave = capturedRequests.filter(r => r.method === 'PATCH').length
    expect(patchCountAfterSave).toBe(1)

    // Now engineer clicks "Gửi mua hàng" when form is CLEAN (not dirty)
    // Finding 3: Must NOT trigger redundant PATCH!
    const submitResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().endsWith('/submit'))
    await page.getByRole('button', { name: 'Gửi mua hàng' }).click()
    await submitResponse
    releaseCanonicalGet.resolve()

    // Verify no redundant PATCH was executed
    const patchCountAfterSubmit = capturedRequests.filter(r => r.method === 'PATCH').length
    expect(patchCountAfterSubmit).toBe(1) // Still 1! No redundant PATCH!

    // Verify submit request executed
    const submitReq = capturedRequests.find(r => r.url.endsWith('/submit'))
    expect(submitReq).toBeDefined()

    // DOM reflects fresh submitted state
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()
  })

  test('3b. Unchanged manual Save does not send PATCH', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, { capturedRequests })
    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    await expect(page.getByLabel('Nơi giao hàng')).toHaveValue('123 Đường Nguyễn Huệ, Quận 1, TP.HCM')

    const save = page.getByRole('button', { name: 'Lưu nháp' })
    await save.click()
    await expect(save).toBeEnabled()
    expect(capturedRequests.filter(r => r.method === 'PATCH')).toHaveLength(0)
  })

  test('3c. A header edit after PATCH cannot be replaced by a delayed canonical GET', async ({ page }) => {
    const mock = await setupMaterialMocks(page)
    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    const address = page.getByLabel('Nơi giao hàng')
    await expect(address).toHaveValue('123 Đường Nguyễn Huệ, Quận 1, TP.HCM')

    const canonicalGetEntered = deferred()
    const releaseCanonicalGet = deferred()
    await page.route(new RegExp(`/api/companies/[^/]+/projects/${projectId}/material-procurement/proposals/${proposalId}$`), async route => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      const snapshot = mock.getActiveProposal()
      canonicalGetEntered.resolve()
      await releaseCanonicalGet.promise
      await route.fulfill({ json: snapshot })
    })

    await address.fill('Địa chỉ đã lưu')
    const patchResponse = page.waitForResponse(r =>
      r.request().method() === 'PATCH' && r.url().endsWith(`/proposals/${proposalId}`))
    await page.getByRole('button', { name: 'Lưu nháp' }).click()
    await patchResponse
    await canonicalGetEntered.promise
    expect(mock.getActiveProposal().deliveryAddress).toBe('Địa chỉ đã lưu')

    await expect(address).toBeEnabled()
    await address.fill('Địa chỉ sửa sau PATCH')

    const canonicalResponse = page.waitForResponse(r =>
      r.request().method() === 'GET' && r.url().endsWith(`/proposals/${proposalId}`))
    releaseCanonicalGet.resolve()
    await canonicalResponse
    await expect(address).toHaveValue('Địa chỉ sửa sau PATCH')
  })

  test('4. Không đổi materialId trên lineId đã persist; signed line giữ identity, không thể xóa và số lượng không dưới phần đã ký', async ({ page }) => {
    const signedLineProposal = createMockProposal({
      lines: [
        {
          lineId: line1Id,
          materialId: material1Id,
          materialName: 'Thép cuộn phi 8',
          specification: 'Mác thép CB240-T, TCVN 1651-1:2018',
          unit: 'kg',
          quantity: '20.0000',
          allocatedQuantity: '10.0000',
          signedQuantity: '10.0000',
          remainingQuantity: '10.0000',
        },
      ],
    })

    await setupMaterialMocks(page, { currentProposal: signedLineProposal })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    // Finding 4: Persisted & signed line has locked material name (no select element)
    await expect(page.locator('select.line-select')).toHaveCount(0)
    await expect(page.getByText('Thép cuộn phi 8')).toBeVisible()
    await expect(page.locator('.signed-badge')).toBeVisible()

    // Finding 4: Signed line has locked delete action (lock icon instead of delete button)
    await expect(page.locator('button.btn-icon-danger')).toHaveCount(0)

    // Quantity minimum constraint: enter 5.0000 (< signed 10.0000)
    const qtyInput = page.locator('input.quantity-input').first()
    await qtyInput.fill('5.0000')

    // Click "Lưu nháp"
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // Validation error triggers and blocks save
    await expect(page.getByText('Số lượng không được nhỏ hơn số lượng đã ký (10.0000).')).toBeVisible()

    // Enter valid quantity >= 10
    await qtyInput.fill('15.0000')
    await page.getByRole('button', { name: 'Lưu nháp' }).click()
    await expect(page.getByText('Đã lưu nháp phiếu yêu cầu thành công.')).toBeVisible()
  })

  test('5. 409 Xung đột giữ nguyên bản nhập của người dùng; retry cùng exact command giữ nguyên key, đổi body đổi key', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, {
      failWith409OnUpdate: true,
      capturedRequests,
    })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    // Edit address
    const addressInput = page.getByLabel('Nơi giao hàng')
    await addressInput.fill('Địa chỉ mới cần cập nhật 409')

    // Click "Lưu nháp"
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // 409 conflict banner appears
    await expect(page.getByText('Xung đột phiên bản (409)')).toBeVisible()

    // User's typed address is preserved!
    await expect(addressInput).toHaveValue('Địa chỉ mới cần cập nhật 409')

    // Click "Lưu nháp" again without changing input -> exact same command
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // Both requests sent same idempotency key because command signature didn't change!
    const patchCalls = capturedRequests.filter(r => r.method === 'PATCH')
    expect(patchCalls.length).toBe(2)
    expect(patchCalls[0].headers['idempotency-key']).toBe(patchCalls[1].headers['idempotency-key'])

    // Now change input
    await addressInput.fill('Địa chỉ thay đổi lần thứ 2')
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // 3rd call has modified body -> MUST generate a new idempotency key!
    const thirdPatch = capturedRequests.filter(r => r.method === 'PATCH')[2]
    expect(thirdPatch.headers['idempotency-key']).not.toBe(patchCalls[0].headers['idempotency-key'])
  })

  test('5b. PATCH retry replays its committed receipt before comparing the stale expectedVersion', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    const mock = await setupMaterialMocks(page, { capturedRequests, loseFirstProposalPatchResponse: true })
    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    await page.getByLabel('Nơi giao hàng').fill('Địa chỉ đã commit')
    const save = page.getByRole('button', { name: 'Lưu nháp' })

    await save.click()
    await expect.poll(() => mock.getActiveProposal().version).toBe(2)
    await expect(save).toBeEnabled()

    const replayResponse = page.waitForResponse(r =>
      r.request().method() === 'PATCH' && r.url().endsWith(`/proposals/${proposalId}`))
    await save.click()
    const replay = await (await replayResponse).json() as { resourceId: string; version: number; replayed: boolean }
    await expect(page.getByText('Đã lưu nháp phiếu yêu cầu thành công.')).toBeVisible()

    const calls = capturedRequests.filter(r => r.method === 'PATCH')
    expect(calls).toHaveLength(2)
    expect(calls[0]!.headers['idempotency-key']).toBe(calls[1]!.headers['idempotency-key'])
    expect(mock.getActiveProposal().version).toBe(2)
    expect(replay).toEqual({ resourceId: proposalId, version: 2, replayed: true })
  })

  test('5c. Submit retry replays its committed receipt before comparing the stale expectedVersion', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    const mock = await setupMaterialMocks(page, { capturedRequests, loseFirstProposalSubmitResponse: true })
    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    const submit = page.getByRole('button', { name: 'Gửi mua hàng' })
    await expect(submit).toBeVisible()

    await submit.click()
    await expect.poll(() => mock.getActiveProposal().version).toBe(2)
    await expect(submit).toBeEnabled()

    const replayResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().endsWith('/submit'))
    await submit.click()
    const replay = await (await replayResponse).json() as { resourceId: string; version: number; replayed: boolean; reviewState: string }
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()

    const calls = capturedRequests.filter(r => r.url.endsWith('/submit'))
    expect(calls).toHaveLength(2)
    expect(calls[0]!.headers['idempotency-key']).toBe(calls[1]!.headers['idempotency-key'])
    expect(mock.getActiveProposal().version).toBe(2)
    expect(replay).toEqual({ resourceId: proposalId, version: 2, replayed: true, reviewState: 'submitted' })
  })

  test('6. FIX BỔ SUNG: mở trang tạo của A, chọn công trình B, Save/Submit điều hướng đến đúng B; cập nhật địa chỉ mặc định', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, { capturedRequests })

    // Open new proposal for Project A
    await page.goto(`/materials/${projectId}/proposals/new`)

    // Initial prefilled address is from Project A
    const deliveryInput = page.getByLabel('Nơi giao hàng')
    await expect(deliveryInput).toHaveValue('123 Đường Nguyễn Huệ, Quận 1, TP.HCM')

    // Switch project dropdown to Project B
    const projectSelect = page.getByLabel('Công trình / Dự án')
    await projectSelect.selectOption(project2Id)

    // Address automatically updates to Project B default address
    await expect(deliveryInput).toHaveValue('Khu công nghiệp Hiệp Phước, Nhà Bè, TP.HCM')

    // Fill form and save
    await page.getByLabel('Ngày cần vật tư').fill('2026-10-30')
    const materialSelect = page.locator('select.line-select').first()
    await materialSelect.selectOption(material1Id)
    const qtyInput = page.locator('input.quantity-input').first()
    await qtyInput.fill('30.0000')

    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // Finding 6: Must navigate to detail under Project B (project2Id), NOT Project A (projectId)!
    await expect(page).toHaveURL(new RegExp(`/materials/${project2Id}/proposals/${proposalId}`))
  })

  test('6b. Selecting Project B then Submit navigates to Project B detail', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, { capturedRequests })
    await page.goto(`/materials/${projectId}/proposals/new`)
    await page.getByLabel('Công trình / Dự án').selectOption(project2Id)
    await expect(page.getByLabel('Nơi giao hàng')).toHaveValue(mockProjectsCompany1[1]!.locationText)
    await page.getByLabel('Ngày cần vật tư').fill('2026-10-30')
    await page.locator('select.line-select').first().selectOption(material1Id)
    await page.locator('input.quantity-input').first().fill('30.0000')

    const submitResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().endsWith('/submit'))
    const canonicalDetail = page.waitForResponse(r =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === `/api/companies/${company1Id}/projects/${project2Id}/material-procurement/proposals/${proposalId}`)
    await page.getByRole('button', { name: 'Gửi mua hàng' }).click()
    await submitResponse
    await canonicalDetail
    await expect(page).toHaveURL(new RegExp(`/materials/${project2Id}/proposals/${proposalId}`))
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()
    expect(capturedRequests.some(r => r.method === 'POST' && r.url.includes(`/projects/${project2Id}/`) && r.url.endsWith('/proposals'))).toBe(true)
    expect(capturedRequests.some(r => r.method === 'POST' && r.url.includes(`/projects/${project2Id}/`) && r.url.endsWith('/submit'))).toBe(true)
  })

  test('7. Company A project response arriving after a real switch cannot replace Company B', async ({ page }) => {
    const state = createAuthTestState({
      sessionCompanies: [
        createCompany({ companyId: company1Id, companyName: 'Công ty VQH' }),
        createCompany({ companyId: company2Id, companyName: 'Công ty Khang Điền' }),
      ],
    })
    await installAuthRoutes(page, state)
    await setupMaterialMocks(page)

    const aRequested = deferred()
    const releaseA = deferred()
    await page.route(new RegExp(`/api/companies/${company1Id}/material-procurement/projects$`), async route => {
      aRequested.resolve()
      await releaseA.promise
      await route.fulfill({ json: mockProjectsCompany1 })
    })

    await page.goto('/materials')
    await aRequested.promise
    await selectCompany(page, company2Id)
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()

    const oldResponse = page.waitForResponse(r => r.url().endsWith(`/api/companies/${company1Id}/material-procurement/projects`))
    releaseA.resolve()
    await oldResponse
    await expect(page.getByText('Công trình Tòa nhà VQH')).toHaveCount(0)
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()
  })

  test('7b. A/new to B/new reuses the page and clears the old project form', async ({ page }) => {
    await setupMaterialMocks(page)
    await page.goto(`/materials/${projectId}/proposals/new`)
    await expect(page.getByLabel('Nơi giao hàng')).toHaveValue(mockProjectsCompany1[0]!.locationText)

    const held = await holdJsonResponse(
      page,
      new RegExp(`/api/companies/${company1Id}/material-procurement/projects$`),
      mockProjectsCompany1,
    )
    const navigation = navigateWithinApp(page, `/materials/${project2Id}/proposals/new`)
    await held.entered
    await expect(page).toHaveURL(new RegExp(`/materials/${project2Id}/proposals/new`))
    await expect(page.getByLabel('Nơi giao hàng')).toHaveCount(0)
    held.release()
    await navigation
    await expect(page.getByLabel('Công trình / Dự án')).toHaveValue(project2Id)
    await expect(page.getByLabel('Nơi giao hàng')).toHaveValue(mockProjectsCompany1[1]!.locationText)
  })

  test('7c. Pending new Save cannot navigate or show Company A success after switching to B', async ({ page }) => {
    await setupTwoCompanies(page)
    await page.goto(`/materials/${projectId}/proposals/new`)
    await expect(page.getByLabel('Nơi giao hàng')).toBeVisible()
    await page.getByLabel('Ngày cần vật tư').fill('2026-10-30')
    await page.locator('select.line-select').first().selectOption(material1Id)
    await page.locator('input.quantity-input').first().fill('25.0000')

    const held = await holdJsonResponse(
      page,
      new RegExp(`/api/companies/${company1Id}/projects/${projectId}/material-procurement/proposals$`),
      { resourceId: proposalId, version: 1, replayed: false },
    )
    const click = page.getByRole('button', { name: 'Lưu nháp' }).click()
    await held.entered
    await selectCompany(page, company2Id)
    await expect(page).toHaveURL('/materials')
    const oldResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/companies/${company1Id}/projects/${projectId}/material-procurement/proposals`)
    held.release()
    await oldResponse
    await click
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()
    await expect(page).toHaveURL('/materials')
    await expect(page.getByText('Đã tạo phiếu yêu cầu mới thành công.')).toHaveCount(0)
  })

  test('7d. Pending Submit from the new form cannot navigate to Company A after switching to B', async ({ page }) => {
    await setupTwoCompanies(page)
    await page.goto(`/materials/${projectId}/proposals/new`)
    await expect(page.getByLabel('Nơi giao hàng')).toBeVisible()
    await page.getByLabel('Ngày cần vật tư').fill('2026-10-30')
    await page.locator('select.line-select').first().selectOption(material1Id)
    await page.locator('input.quantity-input').first().fill('25.0000')

    const held = await holdJsonResponse(
      page,
      new RegExp(`/api/companies/${company1Id}/projects/${projectId}/material-procurement/proposals/${proposalId}/submit$`),
      { resourceId: proposalId, version: 2, replayed: false, reviewState: 'submitted' },
    )
    const click = page.getByRole('button', { name: 'Gửi mua hàng' }).click()
    await held.entered
    await selectCompany(page, company2Id)
    await expect(page).toHaveURL('/materials')
    const oldResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().endsWith(`/proposals/${proposalId}/submit`))
    held.release()
    await oldResponse
    await click
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()
    await expect(page).toHaveURL('/materials')
    await expect(page.getByText('Đã gửi phiếu yêu cầu mua hàng thành công.')).toHaveCount(0)
  })

  test('7e. Pending master create cannot show Company A success after switching to B', async ({ page }) => {
    await setupTwoCompanies(page)
    await page.goto('/materials')
    await page.getByRole('button', { name: 'Danh mục vật tư chuẩn' }).click()
    await page.getByRole('button', { name: 'Thêm vật tư chuẩn' }).click()
    await page.getByLabel('Mã vật tư').fill('VT-OLD-A')
    await page.getByLabel('Tên vật tư chuẩn').fill('Vật tư công ty A')
    await page.getByLabel('Đơn vị tính chuẩn').fill('kg')
    await page.getByLabel('Quy cách kỹ thuật chuẩn').fill('Quy cách công ty A')

    const held = await holdJsonResponse(
      page,
      new RegExp(`/api/companies/${company1Id}/material-procurement/materials$`),
      { resourceId: material1Id, version: 1, replayed: false },
    )
    const click = page.getByRole('button', { name: 'Lưu vật tư' }).click()
    await held.entered
    await selectCompany(page, company2Id)
    const oldResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/companies/${company1Id}/material-procurement/materials`)
    held.release()
    await oldResponse
    await click
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()
    await expect(page.getByText('Thêm vật tư chuẩn mới thành công.')).toHaveCount(0)
    await expect(page.getByText('Vật tư công ty A')).toHaveCount(0)
  })

  test('8. Non-author is read-only and author sees a 403 submit error', async ({ page }) => {
    // 1. Non-author engineer has submit permission but is not author
    const otherEngineerState = createAuthTestState({
      user: { id: otherEngineerId, email: 'other-engineer@taskovia.test' },
      sessionCompanies: [
        createCompany({
          roles: ['site_engineer'],
          permissions: ['material.read', 'material.proposal.submit'],
        }),
      ],
    })
    await installAuthRoutes(page, otherEngineerState)

    const authorProposal = createMockProposal({
      reviewState: 'draft',
      createdBy: engineerId, // created by original engineer
    })
    await setupMaterialMocks(page, { currentProposal: authorProposal })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    // Notice specifically indicates non-author read-only mode
    await expect(page.getByText('Chế độ chỉ đọc: Chỉ người lập phiếu mới có quyền chỉnh sửa phiếu ở trạng thái này.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lưu nháp' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gửi mua hàng' })).toHaveCount(0)

    // 2. Author encounters 403 Forbidden on submit
    const authorState = createAuthTestState({
      user: { id: engineerId, email: 'author@taskovia.test' },
      sessionCompanies: [
        createCompany({
          roles: ['site_engineer'],
          permissions: ['material.read', 'material.proposal.submit'],
        }),
      ],
    })
    await installAuthRoutes(page, authorState)
    await setupMaterialMocks(page, {
      currentProposal: authorProposal,
      failWith403OnSubmit: true,
    })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    await page.getByRole('button', { name: 'Gửi mua hàng' }).click()

    // 403 error message is displayed
    await expect(page.getByText('Bạn không có quyền thực hiện thao tác này.')).toBeVisible()
  })

  test('8b. Buyer can read a draft but has no edit or submit control even when the author', async ({ page }) => {
    await installAuthRoutes(page, createAuthTestState({
      user: { id: engineerId, email: 'buyer@taskovia.test' },
      sessionCompanies: [
        createCompany({
          roles: ['buyer'],
          permissions: ['material.read', 'material.proposal.decide'],
        }),
      ],
    }))
    await setupMaterialMocks(page)
    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)
    await expect(page.getByText('Chế độ chỉ đọc: Bạn không có quyền chỉnh sửa phiếu yêu cầu vật tư.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lưu nháp' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gửi mua hàng' })).toHaveCount(0)
  })

  test('9. Accessibility: Material select và quantity có aria-label theo dòng; lỗi validation gắn aria-describedby', async ({ page }) => {
    await setupMaterialMocks(page)

    await page.goto(`/materials/${projectId}/proposals/new`)

    // Verify row 1 material select aria-label
    const lineMatSelect = page.locator('select.line-select').first()
    await expect(lineMatSelect).toHaveAttribute('aria-label', 'Vật tư dòng 1')

    // Verify row 1 quantity input aria-label
    const lineQtyInput = page.locator('input.quantity-input').first()
    await expect(lineQtyInput).toHaveAttribute('aria-label', 'Số lượng dòng 1')

    // Fill invalid quantity
    await lineQtyInput.fill('chữ_không_phải_số')

    // Trigger validation
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // aria-invalid set to true and aria-describedby points to error message element
    await expect(lineQtyInput).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await lineQtyInput.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`#${describedBy}`)).toBeVisible()
    await expect(page.locator(`#${describedBy}`)).toHaveText('Số lượng phải là số thập phân hợp lệ.')
  })

  test('10. Master create commits once and replays the same receipt after the first response is lost', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    const mock = await setupMaterialMocks(page, { capturedRequests, loseFirstMasterPostResponse: true })
    await page.goto('/materials')
    await page.getByRole('button', { name: 'Danh mục vật tư chuẩn' }).click()
    await page.getByRole('button', { name: 'Thêm vật tư chuẩn' }).click()
    await page.getByLabel('Mã vật tư').fill('VT-CAT-01')
    await page.getByLabel('Tên vật tư chuẩn').fill('Cát xây tô')
    await page.getByLabel('Đơn vị tính chuẩn').fill('m3')
    await page.getByLabel('Quy cách kỹ thuật chuẩn').fill('Cát vàng hạt trung đạt TCVN')

    await page.getByRole('button', { name: 'Lưu vật tư' }).click()
    await expect(page.getByRole('button', { name: 'Lưu vật tư' })).toBeEnabled()
    await expect(page.getByText('Thêm vật tư chuẩn mới thành công.')).toHaveCount(0)
    const committed = mock.getMaterials().filter(m => m.code === 'VT-CAT-01')
    expect(committed).toHaveLength(1)

    const replayResponse = page.waitForResponse(r =>
      r.request().method() === 'POST' && r.url().endsWith('/material-procurement/materials'))
    await page.getByRole('button', { name: 'Lưu vật tư' }).click()
    const replay = await (await replayResponse).json() as { resourceId: string; version: number; replayed: boolean }
    await expect(page.getByText('Thêm vật tư chuẩn mới thành công.')).toBeVisible()

    const postCalls = capturedRequests.filter(r => r.method === 'POST' && r.url.endsWith('/materials'))
    expect(postCalls).toHaveLength(2)
    expect(postCalls[0]!.headers['idempotency-key']).toBeTruthy()
    expect(postCalls[0]!.headers['idempotency-key']).toBe(postCalls[1]!.headers['idempotency-key'])
    expect(mock.getMaterials().filter(m => m.code === 'VT-CAT-01')).toHaveLength(1)
    expect(replay).toEqual({ resourceId: committed[0]!.id, version: committed[0]!.version, replayed: true })
  })

  test('11. Giao diện T5 tuyệt đối không có input chọn nhà cung cấp, giá mua hay hóa đơn', async ({ page }) => {
    await setupMaterialMocks(page)

    await page.goto(`/materials/${projectId}/proposals/new`)

    // Verify absence of supplier and pricing inputs in engineer request UI
    await expect(page.locator('text=/nhà cung cấp/i')).toHaveCount(0)
    await expect(page.locator('text=/đơn giá/i')).toHaveCount(0)
    await expect(page.locator('text=/giá mua/i')).toHaveCount(0)
    await expect(page.locator('text=/hóa đơn/i')).toHaveCount(0)
    await expect(page.locator('input[name*="supplier"]')).toHaveCount(0)
    await expect(page.locator('input[name*="price"]')).toHaveCount(0)
  })
})
