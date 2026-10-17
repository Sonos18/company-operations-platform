import Decimal from 'decimal.js'
import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  createPaymentRequestInputSchema,
  decidePaymentRequestInputSchema,
  materialContractViewSchema,
  materialInvoiceViewSchema,
  materialPaymentRequestViewSchema,
  officializeMaterialInvoiceInputSchema,
  recordMaterialContractInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  type MaterialContractView,
  type MaterialInvoiceView,
  type MaterialPaymentRequestView,
} from '../../shared/schemas/costs/material-finance'
import { materialOrderViewSchema, type MaterialOrderView } from '../../shared/schemas/costs/material-procurement'
import type { PermissionCode } from '../../shared/constants/permissions'

// Flow adjustments (spec 2026-10-16, C2-C5). Two scenario groups, each with its own in-memory
// backend shared by every route and every user of the group:
//  1. the main flow: the accountant records a draft invoice (a PNG photo) and requests payment, the
//     treasurer confirms the payment order (UNC), the accountant uploads the transfer receipt (the
//     request reads "Đã chi – chờ hóa đơn chính thức") and then the official invoice ("Đã chi");
//  2. an order without a contract may carry VAT: 4.000.000 + 300.000 shows a total of 4.300.000.
// The mocks mirror the server rules only as far as the page needs them; the real rules are
// covered by pgTAP (c1_material_flow_adjustments).

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000001'
const proposalId = '50000000-0000-4000-8000-000000000001'
const proposalLineId = '60000000-0000-4000-8000-000000000001'
const materialId = '40000000-0000-4000-8000-000000000001'
const orderId = '80000000-0000-4000-8000-000000000001'
const orderLineId = '83000000-0000-4000-8000-000000000001'
const contractId = '90000000-0000-4000-8000-000000000001'
const installmentKey = '91000000-0000-4000-8000-000000000001'
const supplierId = 'a0000000-0000-4000-8000-000000000001'
const accountantId = '11111111-1111-4111-8111-111111111111'
const treasurerId = '22222222-2222-4222-8222-222222222222'

const orderPath = `/materials/${projectId}/orders/${orderId}`
const supplierName = 'Công ty Thép Hòa Phát'

const accountant = { id: accountantId, email: 'ke-toan@taskovia.test' }
const treasurer = { id: treasurerId, email: 'thu-quy@taskovia.test' }
// C4: the accountant also executes payments; the treasurer only confirms the payment order.
const accountantPermissions: PermissionCode[] = [
  'material.read', 'material.finance.read', 'material.contract.record', 'material.payment.request', 'material.payment.execute',
]
const treasurerPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.payment.approve']

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nsynthetic') })

interface Call {
  method: string
  path: string
  body: unknown
}

interface DerivedContract {
  documentation: 'contract' | 'quotation_only'
  contractNo: string | null
  signedOn: string
  subtotal: string
  vatAmount: string
  total: string
  orderSubtotal: string
  contractFileId: string | null
  signedQuotationFileId: string
  varianceReason: string | null
}

interface FlowState {
  contract: DerivedContract | null
  invoices: MaterialInvoiceView[]
  requests: MaterialPaymentRequestView[]
  evidence: Map<string, { originalFilename: string, mimeType: string, sizeBytes: number, sha256: string }>
  calls: Call[]
  counters: { evidence: number, request: number, invoice: number }
  /** Σ quantity × unit price of the one order line. */
  orderSubtotal: string
}

function createFlowState(orderSubtotal: string, contract: DerivedContract | null): FlowState {
  return { contract, invoices: [], requests: [], evidence: new Map(), calls: [], counters: { evidence: 0, request: 0, invoice: 0 }, orderSubtotal }
}

const zero = new Decimal(0)
const money = (value: Decimal.Value) => new Decimal(value).toFixed(4)
const sumOf = (items: MaterialPaymentRequestView[]) => items.reduce((acc, item) => acc.plus(item.amount), zero)

function apiError(code: string, message: string) {
  return { error: { code, message, requestId: 'mock-request', details: {} } }
}

function buildContract(state: FlowState): MaterialContractView | null {
  const record = state.contract
  if (!record) return null
  const live = state.requests.filter(item => item.state === 'submitted' || item.state === 'approved')
  const paid = state.requests.filter(item => item.state === 'paid')
  const paidAmount = sumOf(paid)
  const pendingAmount = sumOf(live)
  const remaining = new Decimal(record.total).minus(paidAmount).minus(pendingAmount)
  const recorded = state.invoices.filter(item => item.state === 'recorded')
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    supplierId,
    supplierName,
    currencyCode: 'VND',
    documentation: record.documentation,
    contractNo: record.contractNo,
    signedOn: record.signedOn,
    currentVersionNo: 1,
    version: 1,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: record.subtotal,
      vatAmount: record.vatAmount,
      total: record.total,
      orderSubtotalSnapshot: record.orderSubtotal,
      varianceReason: record.varianceReason,
      contractFileId: record.contractFileId,
      signedQuotationFileId: record.signedQuotationFileId,
      reason: null,
      recordedBy: accountantId,
      recordedAt: '2026-10-10T03:00:00.000Z',
    }],
    installments: [{
      installmentKey,
      name: 'Thanh toán 100%',
      amount: record.total,
      dueOn: record.signedOn,
      isAdvance: false,
      seq: 1,
      paid: money(paidAmount),
      pending: money(pendingAmount),
      remaining: money(remaining),
      dueStatus: remaining.isZero() ? 'settled' : 'not_due',
    }],
    totals: {
      committed: money(record.total),
      paid: money(paidAmount),
      pending: money(pendingAmount),
      remaining: money(new Decimal(record.total).minus(paidAmount)),
      overdue: money(0),
      invoiced: money(recorded.reduce((acc, item) => acc.plus(item.total), zero)),
      paidWithoutInvoice: money(0),
      draftInvoiced: money(recorded.filter(item => item.stage === 'draft').reduce((acc, item) => acc.plus(item.total), zero)),
    },
  })
}

function buildOrder(state: FlowState): MaterialOrderView {
  const contract = buildContract(state)
  return materialOrderViewSchema.parse({
    id: orderId,
    version: contract ? 2 : 1,
    orderState: 'active',
    proposalId,
    approvedRevisionId: '70000000-0000-4000-8000-000000000001',
    supplierId,
    supplierName,
    currencyCode: 'VND',
    allocations: [{
      proposalLineId,
      quantity: '10.0000',
      unitPrice: money(new Decimal(state.orderSubtotal).div(10)),
      quotationMaterialName: 'Thép cuộn phi 8',
      mappingConfirmed: true,
      orderLineId,
      materialId,
      materialName: 'Thép cuộn phi 8',
      specification: 'CB240-T',
      unit: 'kg',
    }],
    unsignedQuotationEvidenceFileId: '85000000-0000-4000-8000-000000000001',
    contract: contract
      ? {
          id: contract.id,
          documentation: contract.documentation,
          contractNo: contract.contractNo,
          signedOn: contract.signedOn,
          currentVersionNo: 1,
          total: contract.versions[0]?.total ?? null,
        }
      : null,
    cash: contract
      ? { committed: contract.totals.committed, paid: contract.totals.paid, pending: contract.totals.pending, remaining: contract.totals.remaining }
      : null,
  })
}

/** Routes every API call of `page` to the in-memory backend `state`. */
async function installMocks(page: Page, state: FlowState) {
  await page.route('https://api.iconify.design/**', route => route.fulfill({ json: { prefix: 'lucide', icons: {} } }))
  await page.route('https://auth.taskovia.test/storage/v1/**', route =>
    route.fulfill({ json: { Key: 'synthetic', Id: 'synthetic' }, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await page.route(`**/api/companies/${companyId}/material-procurement/projects`, route => route.fulfill({
    json: [{ projectId, code: 'DA-VQH-01', name: 'Công trình Tòa nhà VQH', locationText: null }],
  }))

  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/.*$/, async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.split('/material-procurement')[1] ?? ''
    const method = request.method()

    if (method === 'GET') {
      if (path === `/orders/${orderId}`) return route.fulfill({ json: buildOrder(state) })
      if (path === `/orders/${orderId}/contract`) return route.fulfill({ json: buildContract(state) })
      if (path === `/contracts/${contractId}/invoices`) return route.fulfill({ json: state.invoices })
      if (path === `/contracts/${contractId}/payment-requests`) return route.fulfill({ json: state.requests })
      return route.fulfill({ status: 404, json: apiError('RESOURCE_NOT_FOUND', 'Không tìm thấy ' + path) })
    }

    const body = request.postDataJSON() as unknown
    state.calls.push({ method, path, body })
    const ack = (resourceId: string, version: number) => route.fulfill({ json: { resourceId, version, replayed: false } })

    if (path === '/evidence/upload-intents') {
      state.counters.evidence += 1
      const id = `e0000000-0000-4000-8000-${String(state.counters.evidence).padStart(12, '0')}`
      state.evidence.set(id, body as { originalFilename: string, mimeType: string, sizeBytes: number, sha256: string })
      return route.fulfill({
        json: {
          evidenceFileId: id,
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: [tenantId, companyId, projectId, id].join('/'),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          replayed: false,
        },
      })
    }
    const finalize = /^\/evidence\/([^/]+)\/finalize$/.exec(path)
    if (finalize) {
      const id = finalize[1]!
      const intent = state.evidence.get(id)
      if (!intent) return route.fulfill({ status: 404, json: apiError('RESOURCE_NOT_FOUND', 'Không tìm thấy tệp') })
      return route.fulfill({
        json: {
          id,
          status: 'finalized',
          originalFilename: intent.originalFilename,
          mimeType: intent.mimeType,
          sizeBytes: intent.sizeBytes,
          sha256: intent.sha256,
          version: 1,
          finalizedAt: new Date().toISOString(),
          replayed: false,
        },
      })
    }

    if (path === `/orders/${orderId}/contract`) {
      const input = recordMaterialContractInputSchema.parse(body)
      if (input.documentation !== 'quotation_only') return route.fulfill({ status: 409, json: apiError('INPUT_INVALID', 'Chỉ ghi nhận đơn không hợp đồng.') })
      const vatAmount = input.vatAmount ?? money(0)
      state.contract = {
        documentation: 'quotation_only',
        contractNo: null,
        signedOn: input.signedOn,
        subtotal: input.subtotal,
        vatAmount,
        total: input.total ?? money(new Decimal(input.subtotal).plus(vatAmount)),
        orderSubtotal: money(state.orderSubtotal),
        contractFileId: null,
        signedQuotationFileId: input.signedQuotationFileId,
        varianceReason: input.varianceReason,
      }
      return ack(contractId, 1)
    }

    if (path === `/contracts/${contractId}/invoices`) {
      const input = recordMaterialInvoiceInputSchema.parse(body)
      state.counters.invoice += 1
      const id = `c0000000-0000-4000-8000-${String(state.counters.invoice).padStart(12, '0')}`
      state.invoices.push(materialInvoiceViewSchema.parse({ id, contractId, ...input, state: 'recorded', voidReason: null, version: 1 }))
      return ack(id, 1)
    }

    const officialMatch = /^\/invoices\/([^/]+)\/official$/.exec(path)
    if (officialMatch) {
      const input = officializeMaterialInvoiceInputSchema.parse(body)
      const at = state.invoices.findIndex(item => item.id === officialMatch[1])
      const target = state.invoices[at]
      if (!target || target.stage !== 'draft' || input.expectedVersion !== target.version) {
        return route.fulfill({ status: 409, json: apiError('VERSION_CONFLICT', 'Phiên bản không khớp.') })
      }
      const next = materialInvoiceViewSchema.parse({
        ...target, stage: 'official', officialFileId: input.officialFileId, officializedAt: '2026-10-16T03:00:00.000Z', version: target.version + 1,
      })
      state.invoices[at] = next
      return ack(next.id, next.version)
    }

    if (path === `/contracts/${contractId}/payment-requests`) {
      const input = createPaymentRequestInputSchema.parse(body)
      if (input.invoiceIds.length === 0) return route.fulfill({ status: 409, json: apiError('INVOICE_REQUIRED', 'Cần hóa đơn') })
      state.counters.request += 1
      const created = materialPaymentRequestViewSchema.parse({
        id: `d0000000-0000-4000-8000-${String(state.counters.request).padStart(12, '0')}`,
        contractId,
        installmentKey: input.installmentKey,
        amount: money(input.amount),
        note: input.note,
        state: 'submitted',
        revisionNo: 1,
        submittedBy: accountantId,
        submittedAt: '2026-10-14T03:00:00.000Z',
        invoiceIds: input.invoiceIds,
        cancelReason: null,
        version: 1,
        decisions: [],
        payment: null,
      })
      state.requests.push(created)
      return ack(created.id, created.version)
    }

    const match = /^\/payment-requests\/([^/]+)\/(decisions|payment)$/.exec(path)
    const index = match ? state.requests.findIndex(item => item.id === match[1]) : -1
    const current = state.requests[index]
    if (!match || !current) return route.fulfill({ status: 404, json: apiError('RESOURCE_NOT_FOUND', 'Không tìm thấy ' + path) })
    if ((body as { expectedVersion: number }).expectedVersion !== current.version) {
      return route.fulfill({ status: 409, json: apiError('VERSION_CONFLICT', 'Phiên bản không khớp.') })
    }
    const bump = (changes: Partial<MaterialPaymentRequestView>) => {
      const next = materialPaymentRequestViewSchema.parse({ ...current, ...changes, version: current.version + 1 })
      state.requests[index] = next
      return ack(next.id, next.version)
    }

    if (match[2] === 'decisions') {
      const input = decidePaymentRequestInputSchema.parse(body)
      return bump({
        state: input.decision === 'approve' ? 'approved' : 'returned',
        decisions: [...current.decisions, {
          revisionNo: current.revisionNo, decision: input.decision, reason: input.reason ?? null,
          decidedBy: treasurerId, decidedAt: '2026-10-15T04:00:00.000Z',
        }],
      })
    }
    const input = recordMaterialPaymentInputSchema.parse(body)
    return bump({
      state: 'paid',
      payment: {
        id: 'f0000000-0000-4000-8000-000000000001',
        paidOn: input.paidOn,
        method: input.method,
        bankReference: input.bankReference,
        proofFileId: input.proofFileId,
        paidBy: accountantId,
        recordedAt: '2026-10-15T05:00:00.000Z',
      },
    })
  })
}

async function signIn(page: Page, user: { id: string, email: string }, permissions: PermissionCode[]) {
  await installAuthRoutes(page, createAuthTestState({
    user,
    sessionCompanies: [createCompany({ tenantId, companyId, permissions })],
  }))
}

async function openAs(page: Page, state: FlowState, user: 'accountant' | 'treasurer') {
  if (user === 'accountant') await signIn(page, accountant, accountantPermissions)
  else await signIn(page, treasurer, treasurerPermissions)
  await installMocks(page, state)
  await page.goto(orderPath)
}

/** Clears a money field and types the Vietnamese amount key by key, as a user would. */
async function typeMoney(field: ReturnType<Page['getByLabel']>, value: string) {
  await field.fill('')
  await field.pressSequentially(value)
  await expect(field).toHaveValue(value)
}

test.use({ viewport: { width: 1280, height: 900 } })

// Serial tests share one backend state; each test is a fresh page (a new sign-in) on that state.
test.describe('Luồng chi mới: hóa đơn nháp, UNC, biên lai, hóa đơn chính thức (mock dùng chung)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  // An 11.000.000 contract already recorded (above the cash threshold, so the treasurer's button
  // reads "Xác nhận đã lập UNC").
  const state = createFlowState('10000000.0000', {
    documentation: 'contract',
    contractNo: 'HD-VT-2026-07',
    signedOn: '2026-10-10',
    subtotal: money(10_000_000),
    vatAmount: money(1_000_000),
    total: money(11_000_000),
    orderSubtotal: money(10_000_000),
    contractFileId: 'e0000000-0000-4000-8000-0000000000f1',
    signedQuotationFileId: 'e0000000-0000-4000-8000-0000000000f2',
    varianceReason: null,
  })
  const posts = (path: string) => state.calls.filter(call => call.method === 'POST' && call.path === path)

  test('1. kế toán nhập hóa đơn nháp dạng ảnh PNG rồi lập đề nghị chi', async ({ page }) => {
    await openAs(page, state, 'accountant')
    await page.getByRole('button', { name: 'Nhập hóa đơn' }).click()
    const invoice = page.getByRole('dialog', { name: 'Nhập hóa đơn nhà cung cấp' })
    await expect(invoice.getByRole('radio', { name: 'Bản nháp / bản đã ký (chờ bản chính thức)' })).toBeChecked()
    await invoice.locator('#invoice-file-input').setInputFiles(png('hoa-don-nhap.png'))
    await invoice.getByRole('button', { name: 'Tải lên tệp' }).click()
    await expect(invoice.getByText('Đã tải lên tệp')).toBeVisible()
    await invoice.locator('#inv-symbol-input').pressSequentially('1C26TAA')
    await invoice.locator('#inv-no-input').pressSequentially('0000789')
    await typeMoney(invoice.locator('#inv-subtotal-input'), '10.000.000')
    await typeMoney(invoice.locator('#inv-vat-input'), '1.000.000')
    await expect(invoice.locator('#inv-total-input')).toHaveValue('11.000.000')
    await invoice.getByLabel('Tên vật tư trên hóa đơn:').pressSequentially('Thép cuộn phi 8 (HĐ)')
    await invoice.getByRole('button', { name: 'Ghi nhận hóa đơn' }).click()
    await expect(invoice).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Nháp', exact: true })).toBeVisible()

    const recorded = recordMaterialInvoiceInputSchema.parse(posts(`/contracts/${contractId}/invoices`)[0]?.body)
    expect(recorded.stage).toBe('draft')
    expect(recorded.total).toBe('11000000')
    expect([...state.evidence.values()].find(item => item.originalFilename === 'hoa-don-nhap.png')?.mimeType).toBe('image/png')
    const invoiceId = state.invoices[0]?.id

    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await dialog.getByRole('radio', { name: /Thanh toán 100%/ }).check()
    await dialog.getByRole('checkbox', { name: /0000789/ }).check()
    await typeMoney(dialog.getByLabel(/Số tiền đề nghị chi/), '11.000.000')
    await dialog.getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chờ lập UNC', exact: true })).toBeVisible()
    expect(createPaymentRequestInputSchema.parse(posts(`/contracts/${contractId}/payment-requests`)[0]?.body)).toMatchObject({
      installmentKey,
      amount: '11000000',
      invoiceIds: [invoiceId],
    })
  })

  test('2. thủ quỹ bấm "Xác nhận đã lập UNC", không có thao tác ghi chi', async ({ page }) => {
    await openAs(page, state, 'treasurer')
    await expect(page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Xác nhận đã lập UNC', exact: true }).click()
    const approve = page.getByRole('dialog', { name: 'Xác nhận đã lập UNC' })
    await approve.getByRole('button', { name: 'Xác nhận đã lập UNC' }).click()
    await expect(approve).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Đã lập UNC – chờ giám đốc duyệt', exact: true })).toBeVisible()
    // The treasurer cannot record the payment: that is the accountant's step now.
    await expect(page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true })).toHaveCount(0)

    const decisions = state.calls.filter(call => call.path.endsWith('/decisions')).map(call => decidePaymentRequestInputSchema.parse(call.body))
    expect(decisions).toEqual([{ expectedVersion: 1, decision: 'approve' }])
  })

  test('3. kế toán cập nhật biên lai chuyển khoản, nhãn "Đã chi – chờ hóa đơn chính thức"', async ({ page }) => {
    await openAs(page, state, 'accountant')
    await page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true }).click()
    const pay = page.getByRole('dialog', { name: 'Cập nhật biên lai chuyển khoản' })
    await pay.getByLabel(/Số tham chiếu/).pressSequentially('FT26289000321')
    await pay.locator('input[type=file]').setInputFiles(png('bien-lai.png'))
    await pay.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(pay.getByText('Đã tải chứng từ')).toBeVisible()
    await pay.getByRole('button', { name: 'Xác nhận đã chi' }).click()
    await expect(pay).toBeHidden()

    // The linked invoice is still a draft, so the request waits for the official one.
    await expect(page.getByRole('cell', { name: 'Đã chi – chờ hóa đơn chính thức', exact: true })).toBeVisible()
    const payment = state.calls.find(call => call.path.endsWith('/payment'))
    expect(recordMaterialPaymentInputSchema.parse(payment?.body)).toMatchObject({ expectedVersion: 2, bankReference: 'FT26289000321' })
    expect(state.requests[0]?.payment?.paidBy).toBe(accountantId)
  })

  test('4. kế toán cập nhật hóa đơn chính thức, nhãn trở thành "Đã chi"', async ({ page }) => {
    await openAs(page, state, 'accountant')
    await expect(page.getByRole('cell', { name: 'Đã chi – chờ hóa đơn chính thức', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cập nhật hóa đơn chính thức' })
    await dialog.locator('#official-file-input').setInputFiles(pdf('hoa-don-chinh-thuc.pdf'))
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải lên tệp')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('cell', { name: 'Chính thức', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Đã chi', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Đã chi – chờ hóa đơn chính thức', exact: true })).toHaveCount(0)
    const call = posts(`/invoices/${state.invoices[0]?.id}/official`)[0]
    expect(officializeMaterialInvoiceInputSchema.parse(call?.body)).toMatchObject({ expectedVersion: 1 })
  })
})

test.describe('Đơn không hợp đồng có VAT (mock dùng chung)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const state = createFlowState('4000000.0000', null)

  test('5. đơn 4.000.000 không hợp đồng có VAT 300.000 hiện tổng 4.300.000', async ({ page }) => {
    await openAs(page, state, 'accountant')
    const panel = page.getByTestId('contract-record-panel')
    await expect(panel).toBeVisible()
    await panel.getByRole('radio', { name: 'Không có hợp đồng', exact: true }).check()

    await page.getByLabel('Báo giá có chữ ký', { exact: true }).setInputFiles(png('bao-gia.png'))
    await page.getByLabel('Ngày ghi nhận').fill('2026-10-10')
    await typeMoney(page.getByLabel('Trước VAT', { exact: true }), '4.000.000')
    await typeMoney(page.getByLabel('VAT', { exact: true }), '300.000')
    await expect(page.getByLabel('Tổng giá trị', { exact: false })).toHaveValue('4.300.000')
    await expect(page.getByTestId('quotation-only-summary')).toHaveText('Thanh toán 100% · Tổng 4.300.000')
    // 4.300.000 stays below the threshold: no warning.
    await expect(page.getByTestId('quotation-threshold-warning')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Lưu ghi nhận' }).click()
    await expect(page.getByTestId('contract-summary')).toBeVisible()
    await expect(page.getByTestId('total-committed')).toContainText('4.300.000')

    const record = recordMaterialContractInputSchema.parse(state.calls.find(call => call.path === `/orders/${orderId}/contract`)?.body)
    expect(record).toMatchObject({ documentation: 'quotation_only', subtotal: '4000000.0000', vatAmount: '300000.0000', total: '4300000.0000' })
    expect(state.contract?.total).toBe('4300000.0000')
  })
})
