import { expect, test } from './fixtures/authenticated'
import type { Page } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  materialFinanceInboxSchema,
  appNotificationPageSchema,
} from '../../shared/schemas/costs/material-finance'
import {
  materialOrderViewSchema,
  materialProposalViewSchema,
} from '../../shared/schemas/costs/material-procurement'

// Proposal numbers ("Đơn 18") and order codes ("ĐH 18-1") on every material screen. The mocks
// answer with the new required keys; the numbers themselves are assigned by the database
// (pgTAP c1_material_proposal_codes), so this spec only checks how the pages show them.

const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000001'
const proposalId = '50000000-0000-4000-8000-000000000001'
const revisionId = '70000000-0000-4000-8000-000000000001'
const lineId = '60000000-0000-4000-8000-000000000001'
const materialId = '40000000-0000-4000-8000-000000000001'
const orderId = '80000000-0000-4000-8000-000000000001'
const orderLineId = '83000000-0000-4000-8000-000000000001'
const supplierId = 'a0000000-0000-4000-8000-000000000001'
const creatorId = '11111111-1111-4111-8111-111111111111'
const notificationId = '36000000-0000-4000-8000-000000000001'

const projectName = 'Eo Gió'
const supplierName = 'Hòa Phát'

const proposalView = materialProposalViewSchema.parse({
  id: proposalId,
  version: 3,
  proposalNo: 18,
  revisionNo: 2,
  summary: { names: ['Thép D10', 'Xi măng PCB40'], total: 5 },
  reviewState: 'approved',
  returnReason: null,
  approvedRevisionId: revisionId,
  currentRevisionId: revisionId,
  projectId,
  createdBy: creatorId,
  neededOn: '2026-10-30',
  deliveryAddress: 'Công trình Eo Gió, Quy Nhơn',
  notes: null,
  lines: [{
    lineId,
    materialId,
    materialName: 'Thép D10',
    notes: null,
    specification: 'CB300-V',
    unit: 'kg',
    quantity: '100.0000',
    allocatedQuantity: '100.0000',
    signedQuantity: '0.0000',
    remainingQuantity: '0.0000',
  }],
  orderProgress: { orderCount: 1, signedOrderCount: 0 },
  contractStatus: [],
})

const orderView = materialOrderViewSchema.parse({
  id: orderId,
  version: 1,
  proposalNo: 18,
  orderSeq: 1,
  summary: { names: ['Thép D10'], total: 1 },
  orderState: 'active',
  proposalId,
  approvedRevisionId: revisionId,
  supplierId,
  supplierName,
  currencyCode: 'VND',
  allocations: [{
    proposalLineId: lineId,
    quantity: '100.0000',
    unitPrice: '15000.0000',
    quotationMaterialName: 'Thép D10',
    mappingConfirmed: true,
    orderLineId,
    materialId,
    materialName: 'Thép D10',
    specification: 'CB300-V',
    unit: 'kg',
  }],
  unsignedQuotationEvidenceFileId: '85000000-0000-4000-8000-000000000001',
  contract: null,
  cash: null,
})

const inboxRow = {
  projectId,
  projectName,
  proposalNo: 18,
  orderSeq: 1,
  orderId,
  supplierName,
}

const inbox = materialFinanceInboxSchema.parse({
  awaitingContract: [{ ...inboxRow, orderSubtotal: '1500000.0000', createdAt: '2026-10-15T03:00:00.000Z' }],
  dueInstallments: [],
  returnedRequests: [],
  pendingApproval: [{
    ...inboxRow,
    contractId: '90000000-0000-4000-8000-000000000001',
    requestId: '34000000-0000-4000-8000-000000000001',
    amount: '750000.0000',
    submittedBy: creatorId,
    submittedAt: '2026-10-16T03:00:00.000Z',
  }],
  approvedAwaitingPayment: [],
})

const notificationPage = appNotificationPageSchema.parse({
  items: [{
    id: notificationId,
    eventKind: 'material.proposal.submitted',
    projectId,
    linkPath: `/materials/${projectId}/proposals/${proposalId}`,
    payload: {
      projectName,
      proposalNo: 18,
      revisionNo: 1,
      actorName: 'Nguyễn Văn An',
      summaryName1: 'Thép D10',
      summaryName2: 'Xi măng PCB40',
      summaryTotal: 5,
    },
    createdAt: '2026-10-16T03:00:00+00:00',
    readAt: null,
  }],
  nextCursor: null,
})

async function mockMaterialApi(page: Page) {
  const base = `/api/companies/${companyId}`
  const project = `${base}/projects/${projectId}/material-procurement`

  await page.route(`**${base}/material-procurement/projects`, route => route.fulfill({
    json: [{ projectId, code: 'DA-EG-01', name: projectName, locationText: null }],
  }))
  await page.route(`**${base}/material-procurement/materials`, route => route.fulfill({ json: [] }))
  await page.route(`**${base}/material-procurement/currency`, route => route.fulfill({ json: { currencyCode: 'VND' } }))
  await page.route(`**${project}/proposals`, route => route.fulfill({ json: [proposalView] }))
  await page.route(`**${project}/proposals/${proposalId}`, route => route.fulfill({ json: proposalView }))
  await page.route(`**${project}/orders`, route => route.fulfill({ json: [orderView] }))
  await page.route(`**${project}/orders/${orderId}`, route => route.fulfill({ json: orderView }))
  await page.route(`**${project}/orders/${orderId}/contract`, route => route.fulfill({ json: null }))
  await page.route(`**${base}/material-finance/inbox**`, route => route.fulfill({ json: inbox }))
  await page.route(`**${base}/cost-notifications`, route => route.fulfill({ json: [] }))
  await page.route(`**${base}/notifications**`, route => route.fulfill({ json: notificationPage }))
}

async function signIn(page: Page) {
  await installAuthRoutes(page, createAuthTestState({
    sessionCompanies: [createCompany({ companyId })],
  }))
  await mockMaterialApi(page)
}

test.use({ viewport: { width: 1280, height: 900 } })

test.describe('Số đơn đề xuất và mã đơn mua vật tư', () => {
  test('danh sách đơn đề xuất hiện "Đơn 18" và tóm tắt vật tư', async ({ page }) => {
    await signIn(page)

    await page.goto(`/materials/${projectId}/proposals`)

    await page.getByRole('tab', { name: /Đã duyệt/ }).click()
    const row = page.locator('tbody tr').first()
    await expect(row.getByRole('link', { name: 'Đơn 18', exact: true })).toHaveAttribute('href', `/materials/${projectId}/proposals/${proposalId}`)
    await expect(row).toContainText('Thép D10, Xi măng PCB40 và 3 vật tư khác')
  })

  test('trang chi tiết đơn đề xuất hiện "Đơn 18 (lần 2)" và bảng đơn mua hiện "ĐH 18-1"', async ({ page }) => {
    await signIn(page)

    await page.goto(`/materials/${projectId}/proposals/${proposalId}`)

    await expect(page.getByRole('heading', { level: 2, name: /Đơn 18 \(lần 2\)/ })).toBeVisible()
    await expect(page.getByText('Thép D10, Xi măng PCB40 và 3 vật tư khác')).toBeVisible()
    await expect(page.locator('table').getByText('ĐH 18-1', { exact: true })).toBeVisible()
  })

  test('trang đơn mua có tiêu đề "ĐH 18-1 · Hòa Phát" và nút quay về "Đơn 18"', async ({ page }) => {
    await signIn(page)

    await page.goto(`/materials/${projectId}/orders/${orderId}`)

    await expect(page.getByRole('heading', { level: 2, name: 'ĐH 18-1 · Hòa Phát' })).toBeVisible()
    await expect(page.getByRole('link', { name: '← Về Đơn 18' })).toHaveAttribute('href', `/materials/${projectId}/proposals/${proposalId}`)
  })

  test('hộp việc tài chính hiện mã đơn ở tab chờ hợp đồng và "Eo Gió · ĐH 18-1" ở tab chờ lập UNC', async ({ page }) => {
    await signIn(page)

    await page.goto('/materials/finance')

    await page.getByRole('tab', { name: /Đơn chờ hợp đồng/ }).click()
    const awaiting = page.getByRole('tabpanel').locator('tbody tr').first()
    await expect(awaiting.getByRole('link', { name: 'ĐH 18-1', exact: true })).toBeVisible()
    await expect(awaiting).toContainText(projectName)

    await page.getByRole('tab', { name: /Chờ lập UNC/ }).click()
    await expect(page.getByRole('tabpanel').locator('tbody tr').first()).toContainText('Eo Gió · ĐH 18-1')
  })

  test('chuông thông báo hiện tiêu đề "Eo Gió · Đơn 18 – Chờ duyệt"', async ({ page }) => {
    await signIn(page)

    await page.goto('/materials')
    await page.getByRole('button', { name: /^Thông báo/ }).click()

    const item = page.getByTestId('material-notification')
    await expect(item).toHaveCount(1)
    await expect(item).toContainText('Eo Gió · Đơn 18 – Chờ duyệt')
    await expect(item).toContainText('Nguyễn Văn An vừa gửi Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác)')
  })
})
