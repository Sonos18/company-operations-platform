import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createCompany } from './fixtures/auth-routes'
import { permissionCodes } from '../../shared/constants/permissions'
import {
  amendMaterialContractInputSchema,
  materialContractViewSchema,
  recordMaterialContractInputSchema,
  type MaterialContractView,
  type RecordMaterialContractInput,
} from '../../shared/schemas/costs/material-finance'
import {
  materialOrderViewSchema,
  type MaterialOrderView,
} from '../../shared/schemas/costs/material-procurement'

const companyId = '10000000-0000-4000-8000-000000000002'
const tenantId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000001'
const orderId = '80000000-0000-4000-8000-000000000001'
const contractId = '81000000-0000-4000-8000-000000000001'
const supplierId = '82000000-0000-4000-8000-000000000001'
const materialId = '40000000-0000-4000-8000-000000000001'
const proposalId = '50000000-0000-4000-8000-000000000001'
const proposalLineId = '60000000-0000-4000-8000-000000000001'
const orderLineId = '83000000-0000-4000-8000-000000000001'
const installment1Key = '84000000-0000-4000-8000-000000000001'
const installment2Key = '84000000-0000-4000-8000-000000000002'
const recorderId = '11111111-1111-4111-8111-111111111111'

const orderPath = `/materials/${projectId}/orders/${orderId}`

interface CapturedRequest {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
}

interface MockState {
  order: MaterialOrderView
  contract: MaterialContractView | null
  contractRead: 'ok' | 'forbidden'
  recordOutcome: 'ok' | 'contract_exists'
  captured: CapturedRequest[]
}

function money(value: number | string) {
  return Number(value).toFixed(4)
}

function createOrder(overrides: Partial<MaterialOrderView> = {}): MaterialOrderView {
  return materialOrderViewSchema.parse({
    id: orderId,
    version: 1,
    orderState: 'active',
    proposalId,
    approvedRevisionId: '70000000-0000-4000-8000-000000000001',
    supplierId,
    supplierName: 'Công ty Thép Hòa Phát',
    currencyCode: 'VND',
    allocations: [{
      proposalLineId,
      quantity: '10.0000',
      unitPrice: '10.0000',
      quotationMaterialName: 'Thép cuộn phi 8',
      mappingConfirmed: true,
      orderLineId,
      materialId,
      materialName: 'Thép cuộn phi 8',
      specification: 'CB240-T',
      unit: 'kg',
    }],
    unsignedQuotationEvidenceFileId: '85000000-0000-4000-8000-000000000001',
    contract: null,
    cash: null,
    ...overrides,
  })
}

function contractFromInput(input: RecordMaterialContractInput, version = 1): MaterialContractView {
  const total = Number(input.total)
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    supplierId,
    supplierName: 'Công ty Thép Hòa Phát',
    currencyCode: 'VND',
    contractNo: input.contractNo,
    signedOn: input.signedOn,
    currentVersionNo: 1,
    version,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: input.subtotal,
      vatAmount: input.vatAmount,
      total: input.total,
      orderSubtotalSnapshot: '100.0000',
      varianceReason: input.varianceReason,
      contractFileId: input.contractFileId,
      signedQuotationFileId: input.signedQuotationFileId,
      reason: null,
      recordedBy: recorderId,
      recordedAt: '2026-10-10T03:00:00.000Z',
    }],
    installments: input.installments.map((item, index) => ({
      ...item,
      seq: index + 1,
      paid: money(0),
      pending: money(0),
      remaining: item.amount,
      dueStatus: 'not_due',
    })),
    totals: {
      committed: money(total),
      paid: money(0),
      pending: money(0),
      remaining: money(total),
      overdue: money(0),
      invoiced: money(0),
      paidWithoutInvoice: money(0),
    },
  })
}

/** A recorded contract whose first installment already has 30 paid. */
function createPaidContract(): MaterialContractView {
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    supplierId,
    supplierName: 'Công ty Thép Hòa Phát',
    currencyCode: 'VND',
    contractNo: 'HD-01',
    signedOn: '2026-10-10',
    currentVersionNo: 1,
    version: 3,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: money(100),
      vatAmount: money(10),
      total: money(110),
      orderSubtotalSnapshot: money(100),
      varianceReason: null,
      contractFileId: '86000000-0000-4000-8000-000000000001',
      signedQuotationFileId: '86000000-0000-4000-8000-000000000002',
      reason: null,
      recordedBy: recorderId,
      recordedAt: '2026-10-10T03:00:00.000Z',
    }],
    installments: [
      { installmentKey: installment1Key, name: 'Tạm ứng', amount: money(50), dueOn: '2026-10-10', isAdvance: true, seq: 1, paid: money(30), pending: money(0), remaining: money(20), dueStatus: 'overdue' },
      { installmentKey: installment2Key, name: 'Thanh toán đợt cuối', amount: money(60), dueOn: '2026-12-10', isAdvance: false, seq: 2, paid: money(0), pending: money(0), remaining: money(60), dueStatus: 'not_due' },
    ],
    totals: {
      committed: money(110),
      paid: money(30),
      pending: money(0),
      remaining: money(80),
      overdue: money(20),
      invoiced: money(0),
      paidWithoutInvoice: money(30),
    },
  })
}

function orderWithContract(contract: MaterialContractView): MaterialOrderView {
  return createOrder({
    version: 2,
    contract: {
      id: contract.id,
      contractNo: contract.contractNo,
      signedOn: contract.signedOn,
      currentVersionNo: contract.currentVersionNo,
      total: contract.versions[0]?.total ?? null,
    },
    cash: { committed: contract.totals.committed, paid: contract.totals.paid, pending: contract.totals.pending, remaining: contract.totals.remaining },
  })
}

function apiError(code: string, message: string) {
  return { error: { code, message, requestId: 'mock-request', details: {} } }
}

async function installMocks(page: Page, state: MockState) {
  await page.route('https://api.iconify.design/**', route => route.fulfill({ json: { prefix: 'lucide', icons: {} } }))
  await page.route('https://auth.taskovia.test/storage/v1/**', route => route.fulfill({
    json: { Key: 'synthetic', Id: 'synthetic' },
    headers: { 'Access-Control-Allow-Origin': '*' },
  }))

  const evidence = new Map<string, Record<string, unknown>>()
  let evidenceSequence = 0

  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/.*/, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.split('/material-procurement')[1] ?? ''
    const method = request.method()
    const capture = (body: unknown) => state.captured.push({ method, path, body, headers: request.headers() })

    if (method === 'GET' && path === `/orders/${orderId}`) {
      await route.fulfill({ json: state.order })
      return
    }

    if (method === 'GET' && path === `/orders/${orderId}/contract`) {
      if (state.contractRead === 'forbidden') {
        await route.fulfill({ status: 403, json: apiError('PERMISSION_DENIED', 'Không có quyền xem tài chính.') })
        return
      }
      await route.fulfill({ json: state.contract })
      return
    }

    if (method === 'POST' && path === `/orders/${orderId}/contract`) {
      const body = recordMaterialContractInputSchema.parse(request.postDataJSON())
      capture(body)
      if (state.recordOutcome === 'contract_exists') {
        await route.fulfill({ status: 409, json: apiError('CONTRACT_EXISTS', 'Đơn đã có hợp đồng.') })
        return
      }
      state.contract = contractFromInput(body)
      state.order = orderWithContract(state.contract)
      await route.fulfill({ json: { resourceId: contractId, version: 1, replayed: false } })
      return
    }

    if (method === 'POST' && path === `/contracts/${contractId}/amendments`) {
      const body = amendMaterialContractInputSchema.parse(request.postDataJSON())
      capture(body)
      await route.fulfill({ json: { resourceId: contractId, version: body.expectedVersion + 1, replayed: false } })
      return
    }

    if (method === 'POST' && path === '/evidence/upload-intents') {
      const body = request.postDataJSON() as Record<string, unknown>
      capture(body)
      evidenceSequence += 1
      const id = `87000000-0000-4000-8000-${String(evidenceSequence).padStart(12, '0')}`
      evidence.set(id, {
        id,
        status: 'finalized',
        originalFilename: body.originalFilename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256,
        version: 1,
        finalizedAt: '2026-10-10T03:00:00.000Z',
        replayed: false,
      })
      await route.fulfill({
        json: {
          evidenceFileId: id,
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: [tenantId, companyId, projectId, id].join('/'),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          replayed: false,
        },
      })
      return
    }

    const finalize = path.match(/^\/evidence\/([^/]+)\/finalize$/)
    if (method === 'POST' && finalize) {
      await route.fulfill({ json: evidence.get(finalize[1] ?? '') })
      return
    }

    await route.fallback()
  })
}

function createState(overrides: Partial<MockState> = {}): MockState {
  return {
    order: createOrder(),
    contract: null,
    contractRead: 'ok',
    recordOutcome: 'ok',
    captured: [],
    ...overrides,
  }
}

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nsynthetic') })

async function fillContractBasics(page: Page, subtotal: string, vat: string) {
  await page.getByLabel('Hợp đồng đã ký (PDF)').setInputFiles(pdf('hop-dong.pdf'))
  await page.getByLabel('Báo giá có chữ ký (PDF)').setInputFiles(pdf('bao-gia.pdf'))
  await page.getByLabel('Số hợp đồng').fill('HD-01')
  await page.getByLabel('Ngày ký').fill('2026-10-10')
  await page.getByLabel('Trước VAT', { exact: true }).fill(subtotal)
  await page.getByLabel('VAT', { exact: true }).fill(vat)
}

test.describe('Chi tiết đơn mua và hợp đồng', () => {
  test('1. Kế toán ghi hợp đồng với đợt tạm ứng 30%, đợt cuối nhận phần còn lại', async ({ page }) => {
    const state = createState()
    await installMocks(page, state)
    await page.goto(orderPath)

    const panel = page.getByTestId('contract-record-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('order-subtotal')).toHaveValue('100 VND')

    await fillContractBasics(page, '100', '10')
    await expect(page.getByLabel('Tổng giá trị hợp đồng')).toHaveValue('110')
    await expect(page.getByLabel('Lý do chênh lệch')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Thêm đợt' }).click()
    await page.getByLabel('Tên đợt 1').fill('Tạm ứng')
    await page.getByLabel('Tỷ lệ đợt 1').fill('30')
    await page.getByLabel('Tạm ứng đợt 1').check()
    await page.getByLabel('Tên đợt 2').fill('Thanh toán còn lại')
    await page.getByLabel('Hạn đợt 2').fill('2026-12-10')

    await expect(page.getByTestId('installment-amount-1')).toHaveText('33')
    await expect(page.getByTestId('installment-amount-2')).toHaveText('77')
    await expect(page.getByTestId('installment-balance')).toContainText('Khớp')

    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()

    await expect(page.getByTestId('contract-summary')).toBeVisible()
    await expect(page.getByTestId('total-committed')).toContainText('110')
    await expect(page.getByTestId('total-paid')).toHaveText('0 VND')
    await expect(panel).toHaveCount(0)

    const record = state.captured.find(entry => entry.method === 'POST' && entry.path === `/orders/${orderId}/contract`)
    expect(record?.headers['idempotency-key']).toBeTruthy()
    const body = recordMaterialContractInputSchema.parse(record?.body)
    expect(body.expectedOrderVersion).toBe(1)
    expect(body.varianceReason).toBeNull()
    expect(body.installments.map(item => [item.name, item.amount, item.isAdvance])).toEqual([
      ['Tạm ứng', '33.0000', true],
      ['Thanh toán còn lại', '77.0000', false],
    ])
    const uploads = state.captured.filter(entry => entry.path === '/evidence/upload-intents')
    expect(uploads.map(entry => (entry.body as { mimeType: string }).mimeType)).toEqual(['application/pdf', 'application/pdf'])
  })

  test('2. Trước VAT khác tổng đơn thì bắt buộc lý do và không gửi request khi thiếu', async ({ page }) => {
    const state = createState()
    await installMocks(page, state)
    await page.goto(orderPath)

    await fillContractBasics(page, '90', '10')
    await expect(page.getByLabel('Lý do chênh lệch')).toBeVisible()

    const panel = page.getByTestId('contract-record-panel')
    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()
    await expect(panel.getByRole('alert').filter({ hasText: 'Cần nhập lý do chênh lệch' })).toBeVisible()
    expect(state.captured).toHaveLength(0)

    await page.getByLabel('Lý do chênh lệch').fill('NCC giảm giá theo số lượng')
    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()
    await expect(page.getByTestId('contract-summary')).toBeVisible()
    const record = state.captured.find(entry => entry.path === `/orders/${orderId}/contract`)
    expect(recordMaterialContractInputSchema.parse(record?.body).varianceReason).toBe('NCC giảm giá theo số lượng')
  })

  test('3. CONTRACT_EXISTS hiện câu tiếng Việt và giữ nguyên dữ liệu đã nhập', async ({ page }) => {
    const state = createState({ recordOutcome: 'contract_exists' })
    await installMocks(page, state)
    await page.goto(orderPath)

    await fillContractBasics(page, '100', '10')
    const panel = page.getByTestId('contract-record-panel')
    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()

    await expect(page.getByTestId('record-error')).toContainText('Đơn này đã có hợp đồng')
    await expect(page.getByLabel('Số hợp đồng')).toHaveValue('HD-01')
    await expect(page.getByLabel('Trước VAT', { exact: true })).toHaveValue('100')
    await expect(page.getByLabel('Tổng giá trị hợp đồng')).toHaveValue('110')
    await expect(page.getByLabel('Tên đợt 1')).toHaveValue('Thanh toán 100%')
  })

  test('4. Mua hàng không có quyền ghi hợp đồng, không đọc được tài chính vẫn thấy trạng thái', async ({ page, authState }) => {
    authState.sessionCompanies = [createCompany({
      permissions: permissionCodes.filter(code => code !== 'material.contract.record' && code !== 'material.finance.read'),
    })]
    const state = createState({
      order: createOrder({
        contract: { id: contractId, contractNo: 'HD-01', signedOn: '2026-10-10', currentVersionNo: 1, total: null },
      }),
      contractRead: 'forbidden',
    })
    await installMocks(page, state)
    await page.goto(orderPath)

    await expect(page.getByTestId('contract-status-only')).toContainText('Đã có hợp đồng HD-01 ngày 10/10/2026')
    await expect(page.getByTestId('contract-record-panel')).toHaveCount(0)
    await expect(page.getByTestId('contract-summary')).toHaveCount(0)
    await expect(page.getByTestId('installment-table')).toHaveCount(0)
    await expect(page.getByTestId('contract-amend-panel')).toHaveCount(0)
  })

  test('5. Phụ lục: đợt đã chi 30 không hạ dưới 30, không xóa được, gửi expectedVersion đúng', async ({ page }) => {
    const contract = createPaidContract()
    const state = createState({ order: orderWithContract(contract), contract })
    await installMocks(page, state)
    await page.goto(orderPath)

    await expect(page.getByTestId('installment-table')).toBeVisible()
    await expect(page.getByTestId('installment-1')).toContainText('Quá hạn')
    await expect(page.getByTestId('installment-1')).toContainText('Tạm ứng')
    await expect(page.getByTestId('total-paid')).toHaveText('30 VND')

    await page.getByRole('button', { name: 'Thêm phụ lục' }).click()
    const amend = page.getByTestId('contract-amend-panel')
    await expect(page.getByTestId('installment-floor-1')).toContainText('30')
    await expect(page.getByRole('button', { name: 'Xóa đợt 1' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Xóa đợt 2' })).toBeEnabled()

    await amend.getByLabel('Phụ lục đã ký (PDF)').setInputFiles(pdf('phu-luc.pdf'))
    await amend.getByLabel('Lý do phụ lục').fill('Điều chỉnh tiến độ thanh toán')

    await page.getByLabel('Số tiền đợt 1').fill('20')
    await amend.getByRole('button', { name: 'Lưu phụ lục' }).click()
    await expect(amend.getByRole('alert').filter({ hasText: 'không được thấp hơn 30' })).toBeVisible()
    expect(state.captured.filter(entry => entry.path.endsWith('/amendments'))).toHaveLength(0)

    await page.getByLabel('Số tiền đợt 1').fill('40')
    await expect(page.getByTestId('installment-balance')).toContainText('Còn thiếu 10')
    await amend.getByRole('button', { name: 'Dồn chênh lệch vào đợt cuối' }).click()
    await expect(page.getByLabel('Số tiền đợt 2')).toHaveValue('70')
    await expect(page.getByTestId('installment-balance')).toContainText('Khớp')

    await amend.getByRole('button', { name: 'Lưu phụ lục' }).click()
    await expect.poll(() => state.captured.filter(entry => entry.path.endsWith('/amendments')).length).toBe(1)

    const sent = state.captured.find(entry => entry.path.endsWith('/amendments'))
    expect(sent?.headers['idempotency-key']).toBeTruthy()
    const body = amendMaterialContractInputSchema.parse(sent?.body)
    expect(body.expectedVersion).toBe(contract.version)
    expect(body.installments.map(item => [item.installmentKey, item.amount])).toEqual([
      [installment1Key, '40.0000'],
      [installment2Key, '70.0000'],
    ])
    expect(body.total).toBe('110.0000')
    expect(body.varianceReason).toBeNull()
    const intent = state.captured.find(entry => entry.path === '/evidence/upload-intents')
    expect(intent?.body).toMatchObject({ evidenceRole: 'contract_amendment', target: { kind: 'material_contract', contractId } })
  })

  test('6. Tiền nhập theo định dạng Việt Nam: hiện giá trị đã hiểu, chặn định dạng sai, gửi số chuẩn', async ({ page }) => {
    const state = createState()
    await installMocks(page, state)
    await page.goto(orderPath)

    const panel = page.getByTestId('contract-record-panel')
    await fillContractBasics(page, '1,000.50', '0')
    await expect(page.getByTestId('contract-subtotal-interpreted')).toContainText('Số không đúng định dạng')
    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()
    await expect(panel.getByRole('alert').filter({ hasText: 'Trước VAT:' })).toBeVisible()
    expect(state.captured).toHaveLength(0)

    await page.getByLabel('Trước VAT', { exact: true }).fill('1.00')
    await expect(page.getByTestId('contract-subtotal-interpreted')).toContainText('Dấu "." chỉ ngăn cách hàng nghìn')

    await page.getByLabel('Trước VAT', { exact: true }).fill('1.000.000')
    await expect(page.getByTestId('contract-subtotal-interpreted')).toHaveText('Hiểu là: 1.000.000')
    await page.getByLabel('VAT', { exact: true }).fill('100.000,5')
    await expect(page.getByTestId('contract-vat-interpreted')).toHaveText('Hiểu là: 100.000,5')
    await expect(page.getByLabel('Tổng giá trị hợp đồng')).toHaveValue('1.100.000,5')
    await expect(page.getByTestId('installment-amount-1')).toHaveText('1.100.000,5')

    await page.getByLabel('Lý do chênh lệch').fill('Giá thực tế theo hợp đồng')
    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()
    await expect(page.getByTestId('contract-summary')).toBeVisible()

    const record = state.captured.find(entry => entry.path === `/orders/${orderId}/contract`)
    const body = recordMaterialContractInputSchema.parse(record?.body)
    expect([body.subtotal, body.vatAmount, body.total]).toEqual(['1000000.0000', '100000.5000', '1100000.5000'])
    expect(body.installments[0]?.amount).toBe('1100000.5000')
  })
})
