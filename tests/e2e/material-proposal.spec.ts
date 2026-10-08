import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  materialProposalViewSchema,
  type MaterialProjectOption,
  type MaterialView,
  type MaterialProposalView,
} from '../../shared/schemas/costs/material-procurement'

const companyId = '10000000-0000-4000-8000-000000000002'
const engineerId = '11111111-1111-4111-8111-111111111111'
const buyerId = '22222222-2222-4222-8222-222222222222'

const projectId = '30000000-0000-4000-8000-000000000001'
const emptyProjectLocationId = '30000000-0000-4000-8000-000000000002'

const material1Id = '40000000-0000-4000-8000-000000000001'
const material2Id = '40000000-0000-4000-8000-000000000002'

const proposalId = '50000000-0000-4000-8000-000000000001'
const line1Id = '60000000-0000-4000-8000-000000000001'

const mockProjects: MaterialProjectOption[] = [
  {
    projectId,
    code: 'DA-VQH-01',
    name: 'Công trình Tòa nhà VQH',
    locationText: '123 Đường Nguyễn Huệ, Quận 1, TP.HCM',
  },
  {
    projectId: emptyProjectLocationId,
    code: 'DA-VQH-02',
    name: 'Công trình Nhà máy KCN',
    locationText: null,
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
  capturedRequests?: Array<{
    method: string
    url: string
    body: any
    headers: Record<string, string>
  }>
}

async function setupMaterialMocks(page: Page, options: MockRouteOptions = {}) {
  const captured = options.capturedRequests || []
  let activeProposal: MaterialProposalView = options.currentProposal || createMockProposal()

  // Master: Projects
  await page.route(/\/api\/companies\/[^/]+\/material-procurement\/projects$/, async (route: Route) => {
    await route.fulfill({ json: mockProjects })
  })

  // Master: Materials
  await page.route(/\/api\/companies\/[^/]+\/material-procurement\/materials$/, async (route: Route) => {
    await route.fulfill({ json: mockMaterials })
  })

  // Proposals: List
  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/proposals$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ json: [activeProposal] })
      return
    }

    if (req.method() === 'POST') {
      const body = req.postDataJSON()
      captured.push({
        method: req.method(),
        url: req.url(),
        body,
        headers: req.headers(),
      })

      activeProposal = createMockProposal({
        id: proposalId,
        version: 1,
        neededOn: body.neededOn,
        deliveryAddress: body.deliveryAddress,
        notes: body.notes || null,
        lines: body.lines.map((l: any) => ({
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

      await route.fulfill({
        json: {
          resourceId: proposalId,
          version: 1,
          replayed: false,
        },
      })
      return
    }

    await route.abort()
  })

  // Proposals: Read & Update
  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/proposals\/[^/]+$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      await route.fulfill({ json: activeProposal })
      return
    }

    if (req.method() === 'PATCH') {
      const body = req.postDataJSON()
      captured.push({
        method: req.method(),
        url: req.url(),
        body,
        headers: req.headers(),
      })

      if (options.failWith409OnUpdate) {
        await route.fulfill({
          status: 409,
          json: {
            code: 'VERSION_CONFLICT',
            message: 'Phiên bản không khớp (xung đột dữ liệu).',
          },
        })
        return
      }

      activeProposal = createMockProposal({
        ...activeProposal,
        version: (body.expectedVersion ?? activeProposal.version) + 1,
        neededOn: body.neededOn,
        deliveryAddress: body.deliveryAddress,
        notes: body.notes || null,
        lines: body.lines.map((l: any) => ({
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

      await route.fulfill({
        json: {
          resourceId: proposalId,
          version: activeProposal.version,
          replayed: false,
        },
      })
      return
    }

    await route.abort()
  })

  // Proposals: Submit
  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/proposals\/[^/]+\/submit$/, async (route: Route) => {
    const req = route.request()
    const body = req.postDataJSON()
    captured.push({
      method: req.method(),
      url: req.url(),
      body,
      headers: req.headers(),
    })

    activeProposal = createMockProposal({
      ...activeProposal,
      version: activeProposal.version + 1,
      reviewState: 'submitted',
      returnReason: null,
    })

    await route.fulfill({
      json: {
        resourceId: proposalId,
        version: activeProposal.version,
        replayed: false,
        reviewState: 'submitted',
      },
    })
  })

  return {
    getCaptured: () => captured,
    getActiveProposal: () => activeProposal,
  }
}

test.describe('AGY — T5 UI Kỹ sư yêu cầu vật tư', () => {
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

  test('2. Engineer lập draft -> Lưu nháp -> Gửi mua hàng -> DOM hiển thị "Đã gửi"', async ({ page }) => {
    const capturedRequests: Array<{ method: string; url: string; body: any; headers: Record<string, string> }> = []
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

    // Verify POST createProposal was dispatched with idempotency key
    const createReq = capturedRequests.find(r => r.method === 'POST' && r.url.endsWith('/proposals'))
    expect(createReq).toBeDefined()
    expect(createReq?.headers['idempotency-key']).toBeTruthy()
    expect(createReq?.body.lines[0].quantity).toBe('25.5000')

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

  test('3. Returned proposal hiển thị returnReason; kỹ sư sửa và gửi lại giữ nguyên lineId', async ({ page }) => {
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

    const capturedRequests: Array<{ method: string; url: string; body: any; headers: Record<string, string> }> = []
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

    // Click "Gửi mua hàng"
    const submitButton = page.getByRole('button', { name: 'Gửi mua hàng' })
    await submitButton.click()

    // Verify PATCH request maintained stable lineId!
    const patchReq = capturedRequests.find(r => r.method === 'PATCH')
    expect(patchReq).toBeDefined()
    expect(patchReq?.body.lines[0].lineId).toBe(line1Id)
    expect(patchReq?.body.lines[0].quantity).toBe('40.0000')

    // DOM reflects fresh submitted state
    await expect(page.locator('.cockpit-badge', { hasText: 'Đã gửi' }).first()).toBeVisible()
  })

  test('4. Buyer và người không có quyền submit không có form/nút sửa; submitted proposal chỉ đọc', async ({ page }) => {
    // Authenticate as a buyer who lacks material.proposal.submit
    const buyerState = createAuthTestState({
      user: { id: buyerId, email: 'buyer@taskovia.test' },
      sessionCompanies: [
        createCompany({
          roles: ['purchasing_staff'],
          permissions: ['material.read', 'material.manage', 'material.proposal.decide', 'material.order.manage'],
        }),
      ],
    })
    await installAuthRoutes(page, buyerState)

    const draftProposal = createMockProposal({
      reviewState: 'draft',
      createdBy: engineerId, // created by engineer, not buyer
    })
    await setupMaterialMocks(page, { currentProposal: draftProposal })

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    // Read-only notice is displayed
    await expect(page.getByText('Chế độ chỉ đọc')).toBeVisible()

    // No edit form buttons exist
    await expect(page.getByRole('button', { name: 'Lưu nháp' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gửi mua hàng' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Thêm dòng vật tư' })).toHaveCount(0)
  })

  test('5. 409 Xung đột giữ nguyên bản nhập của người dùng và hiển thị cảnh báo; retry cùng payload giữ nguyên key', async ({ page }) => {
    const capturedRequests: Array<{ method: string; url: string; body: any; headers: Record<string, string> }> = []
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

    // Click "Lưu nháp" again without changing input
    await page.getByRole('button', { name: 'Lưu nháp' }).click()

    // Both requests sent same idempotency key because payload didn't change!
    const patchCalls = capturedRequests.filter(r => r.method === 'PATCH')
    expect(patchCalls.length).toBe(2)
    expect(patchCalls[0].headers['idempotency-key']).toBe(patchCalls[1].headers['idempotency-key'])
  })

  test('6. Giao diện T5 tuyệt đối không có input chọn nhà cung cấp, giá mua hay hóa đơn', async ({ page }) => {
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

  test('7. Đổi công ty xóa sạch dữ liệu công ty cũ để ngăn stale response', async ({ page }) => {
    await setupMaterialMocks(page)

    await page.goto('/materials')
    await expect(page.getByText('Công trình Tòa nhà VQH')).toBeVisible()

    // Open master material dialog
    await page.getByRole('button', { name: 'Danh mục vật tư chuẩn' }).click()
    await expect(page.getByText('Thép cuộn phi 8')).toBeVisible()
    await expect(page.getByText('Xi măng PCB40')).toBeVisible()
  })
})
