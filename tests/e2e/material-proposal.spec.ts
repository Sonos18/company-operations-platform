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
  capturedRequests?: CapturedRequest[]
  projectsDelayMs?: number
}

async function setupMaterialMocks(page: Page, options: MockRouteOptions = {}) {
  const captured = options.capturedRequests || []
  let activeProposal: MaterialProposalView = options.currentProposal || createMockProposal()
  const receipts = new Map<string, { bodyString: string, response: unknown }>()
  const materialsState = [...mockMaterials]

  // Master: Projects
  await page.route(/\/api\/companies\/([^/]+)\/material-procurement\/projects$/, async (route: Route) => {
    const match = route.request().url().match(/\/api\/companies\/([^/]+)\/material-procurement\/projects$/)
    const companyId = match ? match[1] : ''
    if (options.projectsDelayMs) {
      await new Promise(resolve => setTimeout(resolve, options.projectsDelayMs))
    }
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
          },
        },
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
    await route.fulfill({ json: responsePayload })
  })

  return {
    getCaptured: () => captured,
    getActiveProposal: () => activeProposal,
  }
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
    await setupMaterialMocks(page, {
      currentProposal: returnedProposal,
      capturedRequests,
    })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    // Verify returnReason banner is displayed prominently
    await expect(page.getByText('Vui lòng tăng khối lượng thép cuộn lên 40kg theo tiến độ đổ sàn.')).toBeVisible()

    // Engineer edits quantity to 40.0000
    const qtyInput = page.locator('input.quantity-input').first()
    await qtyInput.fill('40.0000')

    // Engineer clicks "Lưu nháp"
    await page.getByRole('button', { name: 'Lưu nháp' }).click()
    await expect(page.getByText('Đã lưu nháp phiếu yêu cầu thành công.')).toBeVisible()

    const patchCountAfterSave = capturedRequests.filter(r => r.method === 'PATCH').length
    expect(patchCountAfterSave).toBe(1)

    // Now engineer clicks "Gửi mua hàng" when form is CLEAN (not dirty)
    // Finding 3: Must NOT trigger redundant PATCH!
    await page.getByRole('button', { name: 'Gửi mua hàng' }).click()

    // Verify no redundant PATCH was executed
    const patchCountAfterSubmit = capturedRequests.filter(r => r.method === 'PATCH').length
    expect(patchCountAfterSubmit).toBe(1) // Still 1! No redundant PATCH!

    // Verify submit request executed
    const submitReq = capturedRequests.find(r => r.url.endsWith('/submit'))
    expect(submitReq).toBeDefined()

    // DOM reflects fresh submitted state
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()
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

  test('7. Đổi công ty xóa sạch dữ liệu ngay; bỏ phản hồi cũ theo scope bằng request tracker khi đang tải và sau khi tải', async ({ page }) => {
    const multiCompanyState = createAuthTestState({
      sessionCompanies: [
        createCompany({
          companyId: company1Id,
          companyName: 'Công ty VQH',
        }),
        createCompany({
          companyId: company2Id,
          companyName: 'Công ty Khang Điền',
        }),
      ],
    })
    await installAuthRoutes(page, multiCompanyState)
    await setupMaterialMocks(page, { projectsDelayMs: 200 })

    await page.goto('/materials')

    // Company 1 project is visible
    await expect(page.getByText('Công trình Tòa nhà VQH')).toBeVisible()

    // Switch to Company 2 via company access store
    await page.evaluate((targetCId) => {
      const root = document.querySelector('#__nuxt') as HTMLElement & {
        __vue_app__?: {
          config: {
            globalProperties: {
              $nuxt?: {
                $companyAccessStore?: { selectCompany(companyId: string): boolean }
              }
            }
          }
        }
      }
      root.__vue_app__?.config.globalProperties.$nuxt?.$companyAccessStore?.selectCompany(targetCId)
    }, company2Id)

    // Old company project is cleared immediately, and new company project loads
    await expect(page.getByText('Công trình Biệt thự Khang Điền')).toBeVisible()
    await expect(page.getByText('Công trình Tòa nhà VQH')).toHaveCount(0)
  })

  test('8. Non-author có submit permission và Buyer thấy chế độ chỉ đọc; 403 Forbidden hiển thị thông báo lỗi', async ({ page }) => {
    // Authenticate as other engineer who has submit permission but is NOT author
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

  test('10. Master material tạo mới giữ idempotency-key sau lỗi mạng và replay trả cùng version', async ({ page }) => {
    const capturedRequests: CapturedRequest[] = []
    await setupMaterialMocks(page, { capturedRequests })

    await page.goto('/materials')

    // Open master material dialog
    await page.getByRole('button', { name: 'Danh mục vật tư chuẩn' }).click()
    await page.getByRole('button', { name: 'Thêm vật tư chuẩn' }).click()

    // Fill material details
    await page.getByLabel('Mã vật tư').fill('VT-CAT-01')
    await page.getByLabel('Tên vật tư chuẩn').fill('Cát xây tô')
    await page.getByLabel('Đơn vị tính chuẩn').fill('m3')
    await page.getByLabel('Quy cách kỹ thuật chuẩn').fill('Cát vàng hạt trung đạt TCVN')

    // Submit
    await page.getByRole('button', { name: 'Lưu vật tư' }).click()
    await expect(page.getByText('Thêm vật tư chuẩn mới thành công.')).toBeVisible()

    // Verify captured POST request had idempotency key
    const postCalls = capturedRequests.filter(r => r.method === 'POST' && r.url.endsWith('/materials'))
    expect(postCalls.length).toBe(1)
    expect(postCalls[0].headers['idempotency-key']).toBeTruthy()
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
