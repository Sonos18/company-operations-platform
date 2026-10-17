import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  appNotificationPageSchema,
  projectMaterialFinanceSummarySchema,
  supplierMaterialFinanceSchema,
} from '../../shared/schemas/costs/material-finance'
import type { PermissionCode } from '../../shared/constants/permissions'

const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000001'
const orderA = '31000000-0000-4000-8000-000000000001'
const orderB = '31000000-0000-4000-8000-000000000002'
const supplierA = '32000000-0000-4000-8000-000000000001'
const supplierB = '32000000-0000-4000-8000-000000000002'
const contractA = '33000000-0000-4000-8000-000000000001'
const contractB = '33000000-0000-4000-8000-000000000002'
const requestId = '34000000-0000-4000-8000-000000000001'
const userId = '11111111-1111-4111-8111-111111111111'
const costNotificationId = '35000000-0000-4000-8000-000000000001'
const materialNotificationNewId = '36000000-0000-4000-8000-000000000001'
const materialNotificationOldId = '36000000-0000-4000-8000-000000000002'

const zero = '0.0000'
const totals = (overrides: Partial<Record<'committed' | 'paid' | 'pending' | 'remaining' | 'overdue' | 'invoiced' | 'paidWithoutInvoice' | 'draftInvoiced', string>>) => ({
  committed: zero, paid: zero, pending: zero, remaining: zero, overdue: zero, invoiced: zero, paidWithoutInvoice: zero, draftInvoiced: zero,
  ...overrides,
})

const contractRowA = {
  contractId: contractA,
  projectId,
  orderId: orderA,
  supplierId: supplierA,
  supplierName: 'NCC Thép Hòa Phát',
  contractNo: 'HD-VT-01',
  totals: totals({ committed: '110.0000', paid: '30.0000', pending: '10.0000', remaining: '80.0000', overdue: '70.0000', invoiced: '60.0000', draftInvoiced: '25.0000' }),
}
const contractRowB = {
  contractId: contractB,
  projectId,
  orderId: orderB,
  supplierId: supplierB,
  supplierName: 'NCC Xi măng Vicem',
  contractNo: 'HD-VT-02',
  totals: totals({ committed: '60.0000', paid: '30.0000', pending: '10.0000', remaining: '30.0000', invoiced: '40.0000' }),
}

const projectSummary = projectMaterialFinanceSummarySchema.parse({
  projectId,
  currencyCode: 'VND',
  totals: totals({
    committed: '1100170.5000', paid: '60.0000', pending: '20.0000', remaining: '1100110.5000',
    overdue: '70.0000', invoiced: '100.0000', paidWithoutInvoice: '0.0000', draftInvoiced: '0.0000',
  }),
  contracts: [contractRowA, contractRowB],
})

const suppliers = supplierMaterialFinanceSchema.parse([
  { supplierId: supplierA, supplierName: contractRowA.supplierName, currencyCode: 'VND', totals: contractRowA.totals, contracts: [contractRowA] },
  { supplierId: supplierB, supplierName: contractRowB.supplierName, currencyCode: 'VND', totals: contractRowB.totals, contracts: [contractRowB] },
])

const materialNotificationPage = appNotificationPageSchema.parse({
  items: [
    {
      id: materialNotificationNewId,
      eventKind: 'material.order.created',
      projectId,
      linkPath: `/materials/${projectId}/finance`,
      payload: { supplierName: 'NCC Thép Hòa Phát' },
      createdAt: '2026-10-15T03:00:00+00:00',
      readAt: null,
    },
    {
      id: materialNotificationOldId,
      eventKind: 'material.payment.paid',
      projectId,
      linkPath: '/materials/finance/suppliers',
      payload: { supplierName: 'NCC Thép Hòa Phát', contractNo: 'HD-VT-01' },
      createdAt: '2026-10-10T03:00:00+00:00',
      readAt: null,
    },
  ],
  nextCursor: null,
})

const costNotification = {
  id: costNotificationId,
  projectId,
  requestId,
  submittedVersionId: '37000000-0000-4000-8000-000000000001',
  kind: 'installment',
  decisionId: '38000000-0000-4000-8000-000000000001',
  recipientId: userId,
  deliveryState: 'available',
  readAt: null,
  createdAt: '2026-10-12T03:00:00.000Z',
}

function authFor(permissions: PermissionCode[]) {
  return createAuthTestState({
    sessionCompanies: [createCompany({ companyId, permissions })],
  })
}

const treasurerPermissions: PermissionCode[] = [
  'material.read',
  'material.finance.read',
  'material.payment.approve',
  'material.payment.execute',
  'cost.notification.read',
]

async function mockFinanceReads(page: Page) {
  const base = `/api/companies/${companyId}`
  await page.route(`**${base}/material-procurement/projects`, route => route.fulfill({
    json: [{ projectId, code: 'DA-VQH-01', name: 'Công trình Tòa nhà VQH', locationText: null }],
  }))
  await page.route(`**${base}/projects/${projectId}/material-procurement/material-finance/summary`, route => route.fulfill({ json: projectSummary }))
  await page.route(`**${base}/material-finance/suppliers`, route => route.fulfill({ json: suppliers }))
}

interface ReadCall { url: string, idempotencyKey: string | undefined }

async function mockNotifications(page: Page, options: { materialStatus?: number, costStatus?: number } = {}) {
  const reads: ReadCall[] = []
  const base = `/api/companies/${companyId}`
  await page.route(`**${base}/cost-notifications`, route => options.costStatus
    ? route.fulfill({ status: options.costStatus, json: { code: 'INTERNAL', message: 'cost notifications unavailable' } })
    : route.fulfill({ json: [costNotification] }))
  await page.route(`**${base}/notifications**`, (route) => {
    const request = route.request()
    if (request.method() === 'POST' && /\/notifications\/[^/]+\/read$/.test(request.url())) {
      reads.push({ url: new URL(request.url()).pathname, idempotencyKey: request.headers()['idempotency-key'] })
      return route.fulfill({ json: { resourceId: materialNotificationNewId, version: 1, replayed: false } })
    }
    if (options.materialStatus) {
      return route.fulfill({ status: options.materialStatus, json: { code: 'INTERNAL', message: 'notifications unavailable' } })
    }
    return route.fulfill({ json: materialNotificationPage })
  })
  return reads
}

test.use({ viewport: { width: 1280, height: 900 } })

test.describe('Số liệu tài chính vật tư', () => {
  test('giám đốc xem số liệu dự án với cam kết và quá hạn từ mock', async ({ page }) => {
    await installAuthRoutes(page, authFor(['material.read', 'material.finance.read']))
    await mockFinanceReads(page)

    await page.goto(`/materials/${projectId}/finance`)

    await expect(page.getByRole('heading', { name: 'Vật tư', exact: true })).toBeVisible()
    const committed = page.getByTestId('material-total-committed')
    await expect(committed).toContainText('Cam kết')
    // One display formatter for A4/A5 money: "." groups thousands and "," marks decimals.
    await expect(committed.locator('.metric-amount')).toHaveText('1.100.170,5')
    const overdue = page.getByTestId('material-total-overdue')
    await expect(overdue).toContainText('Quá hạn')
    await expect(overdue.locator('.metric-amount')).toHaveText('70')
    await expect(overdue.locator('.metric-amount')).toHaveCSS('color', 'rgb(185, 28, 28)')
    await expect(committed.locator('.metric-amount')).not.toHaveCSS('color', 'rgb(185, 28, 28)')
    for (const label of ['Đã chi', 'Đang chờ chi', 'Còn phải trả', 'Đã nhận hóa đơn', 'Đã chi chưa có hóa đơn']) {
      await expect(page.getByTestId('material-finance-totals').getByText(label, { exact: true })).toBeVisible()
    }

    const rows = page.getByTestId('project-contracts-table').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('NCC Thép Hòa Phát')
    await expect(rows.first()).toContainText('HD-VT-01')
    await expect(rows.first().getByRole('link', { name: 'Xem đơn' })).toHaveAttribute('href', `/materials/${projectId}/orders/${orderA}`)
  })

  test('công nợ nhà cung cấp có hai nhà cung cấp và mở rộng để xem hợp đồng', async ({ page }) => {
    await installAuthRoutes(page, authFor(['material.read', 'material.finance.read']))
    await mockFinanceReads(page)

    await page.goto('/materials/finance/suppliers')

    await expect(page.getByTestId('supplier-row')).toHaveCount(2)
    await expect(page.getByTestId('supplier-draft-invoiced').first()).toHaveText('25')
    const toggle = page.getByRole('button', { name: /NCC Thép Hòa Phát/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('HD-VT-01')).toHaveCount(0)

    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = page.getByRole('region', { name: 'Hợp đồng của NCC Thép Hòa Phát' })
    await expect(panel).toContainText('HD-VT-01')
    await expect(panel.getByRole('link', { name: 'Công trình Tòa nhà VQH' })).toHaveAttribute('href', `/materials/${projectId}/finance`)
    await expect(page.getByText('HD-VT-02')).toHaveCount(0)
  })
})

test.describe('Chuông thông báo gộp', () => {
  test('gộp thông báo C1 và vật tư, badge cộng cả hai và bấm thông báo vật tư thì đánh dấu đã đọc rồi chuyển trang', async ({ page }) => {
    await installAuthRoutes(page, authFor(treasurerPermissions))
    await mockFinanceReads(page)
    const reads = await mockNotifications(page)

    await page.goto('/materials')
    const bell = page.getByRole('button', { name: 'Thông báo phê duyệt khoản chi', exact: true })
    await expect(bell.locator('.badge')).toHaveText('3')

    await bell.click()
    const items = page.getByRole('region', { name: 'Danh sách thông báo' }).locator('li')
    await expect(items).toHaveCount(3)
    // Newest first across both sources: material (10-15), C1 (10-12), material (10-10).
    await expect(items.nth(0)).toContainText('Đơn mua mới chờ hợp đồng')
    await expect(items.nth(1)).toContainText('Quyết định đề nghị khoản chi')
    await expect(items.nth(2)).toContainText('Đề nghị chi đã được chi')

    await items.nth(0).getByRole('button').click()

    await expect(page).toHaveURL(new RegExp(`/materials/${projectId}/finance$`))
    expect(reads).toHaveLength(1)
    expect(reads[0]?.url).toBe(`${`/api/companies/${companyId}`}/notifications/${materialNotificationNewId}/read`)
    expect(reads[0]?.idempotencyKey).toBeTruthy()
  })

  test('một nguồn lỗi vẫn hiện nguồn còn lại', async ({ page }) => {
    await installAuthRoutes(page, authFor(treasurerPermissions))
    await mockFinanceReads(page)
    await mockNotifications(page, { materialStatus: 500 })

    await page.goto('/materials')
    const bell = page.getByRole('button', { name: 'Thông báo phê duyệt khoản chi', exact: true })
    await expect(bell.locator('.badge')).toHaveText('1')
    await bell.click()
    await expect(page.getByRole('region', { name: 'Danh sách thông báo' }).locator('li')).toHaveCount(1)
  })

  test('nguồn thông báo C1 lỗi vẫn hiện thông báo vật tư', async ({ page }) => {
    await installAuthRoutes(page, authFor(treasurerPermissions))
    await mockFinanceReads(page)
    await mockNotifications(page, { costStatus: 500 })

    await page.goto('/materials')
    const bell = page.getByRole('button', { name: 'Thông báo phê duyệt khoản chi', exact: true })
    await expect(bell.locator('.badge')).toHaveText('2')
    await bell.click()
    await expect(page.getByTestId('material-notification')).toHaveCount(2)
  })
})

test.describe('Menu Tài chính vật tư', () => {
  const sidebarLink = (page: Page) => page.getByTestId('app-sidebar').getByRole('link', { name: 'Tài chính vật tư', exact: true })

  test('ẩn với người chỉ có material.read và material.order.manage', async ({ page }) => {
    await installAuthRoutes(page, authFor(['material.read', 'material.order.manage']))
    await mockFinanceReads(page)

    await page.goto('/materials')

    await expect(page.getByTestId('app-sidebar').getByRole('link', { name: 'Vật tư', exact: true })).toBeVisible()
    await expect(sidebarLink(page)).toHaveCount(0)
  })

  test('hiện với thủ quỹ', async ({ page }) => {
    await installAuthRoutes(page, authFor(['material.read', 'material.finance.read', 'material.payment.approve', 'material.payment.execute']))
    await mockFinanceReads(page)

    await page.goto('/materials')

    await expect(sidebarLink(page)).toBeVisible()
    await expect(sidebarLink(page)).toHaveAttribute('href', '/materials/finance')
  })
})
