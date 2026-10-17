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
  projectMaterialFinanceSummarySchema,
  recordMaterialContractInputSchema,
  recordMaterialPaymentInputSchema,
  type MaterialContractView,
  type MaterialInvoiceView,
  type MaterialPaymentRequestView,
  type ProjectMaterialFinanceSummary,
  type RecordMaterialContractInput,
} from '../../shared/schemas/costs/material-finance'
import { materialOrderViewSchema, type MaterialOrderView } from '../../shared/schemas/costs/material-procurement'
import type { PermissionCode } from '../../shared/constants/permissions'

// One mock backend per scenario group, shared by every route and every user. A 4.000.000 order is
// recorded without a contract (signed quotation as a PNG), paid by a request without an invoice
// and in cash, and the project page counts the money as paid. A 48.000.000 order never offers
// "Không có hợp đồng" or "Tiền mặt". The mock mirrors the server rules only as far as the page
// needs them (the real rules are covered by pgTAP): an order recorded without a contract gets one
// generated installment "Thanh toán 100%" and needs no invoice.

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
const supplierName = 'Công ty Vật liệu Xây dựng Minh Phát'

const accountant = { id: accountantId, email: 'ke-toan@taskovia.test' }
const treasurer = { id: treasurerId, email: 'thu-quy@taskovia.test' }
const accountantPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.contract.record', 'material.payment.request']
const treasurerPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.payment.approve', 'material.payment.execute']

const png = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
})

interface Call {
  method: string
  path: string
  body: unknown
}

interface SmallOrderState {
  /** Σ quantity × unit price of the one order line, as "10 × unitPrice". */
  unitPrice: string
  record: RecordMaterialContractInput | null
  requests: MaterialPaymentRequestView[]
  /** A draft (signed copy) invoice the accountant already recorded; every non-advance request needs one (C4). */
  invoices: MaterialInvoiceView[]
  evidence: Map<string, { originalFilename: string, mimeType: string, sizeBytes: number, sha256: string }>
  calls: Call[]
  counters: { evidence: number, request: number }
}

const QUANTITY = '10.0000'

const draftInvoiceId = 'c0000000-0000-4000-8000-000000000001'

function buildDraftInvoice(unitPrice: string): MaterialInvoiceView {
  const total = new Decimal(QUANTITY).times(unitPrice).toFixed(4)
  return materialInvoiceViewSchema.parse({
    id: draftInvoiceId,
    contractId,
    invoiceSymbol: '1C26TBB',
    invoiceNo: '0000123',
    issuedOn: '2026-10-10',
    subtotal: total,
    vatAmount: '0.0000',
    total,
    fileId: 'e0000000-0000-4000-8000-000000000001',
    stage: 'draft',
    state: 'recorded',
    voidReason: null,
    version: 1,
    lines: [],
  })
}

function createState(unitPrice: string): SmallOrderState {
  return { unitPrice, record: null, requests: [], invoices: [buildDraftInvoice(unitPrice)], evidence: new Map(), calls: [], counters: { evidence: 0, request: 0 } }
}

const zero = new Decimal(0)
const money = (value: Decimal.Value) => new Decimal(value).toFixed(4)
const sumOf = (items: MaterialPaymentRequestView[]) => items.reduce((acc, item) => acc.plus(item.amount), zero)
const orderSubtotal = (state: SmallOrderState) => new Decimal(QUANTITY).times(state.unitPrice)

function apiError(code: string, message: string) {
  return { error: { code, message, requestId: 'mock-request', details: {} } }
}

/** What the server derives from a record: the totals and the installment schedule. */
function derive(state: SmallOrderState) {
  const record = state.record
  if (!record) return null
  if (record.documentation === 'quotation_only') {
    const total = record.total ?? new Decimal(record.subtotal).plus(record.vatAmount ?? 0).toFixed(4)
    return {
      documentation: 'quotation_only' as const,
      contractNo: null,
      subtotal: record.subtotal,
      vatAmount: record.vatAmount ?? money(0),
      total,
      contractFileId: null,
      varianceReason: record.varianceReason,
      installments: [{ installmentKey, name: 'Thanh toán 100%', amount: total, dueOn: record.signedOn, isAdvance: false }],
    }
  }
  return {
    documentation: 'contract' as const,
    contractNo: record.contractNo,
    subtotal: record.subtotal,
    vatAmount: record.vatAmount,
    total: record.total,
    contractFileId: record.contractFileId,
    varianceReason: record.varianceReason,
    installments: record.installments,
  }
}

function buildContract(state: SmallOrderState): MaterialContractView | null {
  const record = state.record
  const derived = derive(state)
  if (!record || !derived) return null
  const live = state.requests.filter(item => item.state === 'submitted' || item.state === 'approved')
  const paid = state.requests.filter(item => item.state === 'paid')
  const forKey = (items: MaterialPaymentRequestView[], key: string) => items.filter(item => item.installmentKey === key)
  const totalPaid = sumOf(paid)
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    projectName: 'Công trình Tòa nhà VQH',
    proposalNo: 7,
    orderSeq: 1,
    supplierId,
    supplierName,
    currencyCode: 'VND',
    documentation: derived.documentation,
    contractNo: derived.contractNo,
    signedOn: record.signedOn,
    currentVersionNo: 1,
    version: 1,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: derived.subtotal,
      vatAmount: derived.vatAmount,
      total: derived.total,
      orderSubtotalSnapshot: money(orderSubtotal(state)),
      varianceReason: derived.varianceReason,
      contractFileId: derived.contractFileId,
      signedQuotationFileId: record.signedQuotationFileId,
      reason: null,
      recordedBy: accountantId,
      recordedAt: '2026-10-10T03:00:00.000Z',
    }],
    installments: derived.installments.map((item, index) => {
      const paidAmount = sumOf(forKey(paid, item.installmentKey))
      const pendingAmount = sumOf(forKey(live, item.installmentKey))
      const remaining = new Decimal(item.amount).minus(paidAmount).minus(pendingAmount)
      return {
        ...item,
        seq: index + 1,
        paid: money(paidAmount),
        pending: money(pendingAmount),
        remaining: money(remaining),
        dueStatus: remaining.isZero() ? 'settled' : 'not_due',
      }
    }),
    totals: {
      committed: money(derived.total),
      paid: money(totalPaid),
      pending: money(sumOf(live)),
      remaining: money(new Decimal(derived.total).minus(totalPaid)),
      overdue: money(0),
      invoiced: money(0),
      // Orders without a contract need no invoice, so they stay out of this figure.
      paidWithoutInvoice: money(derived.documentation === 'quotation_only' ? 0 : totalPaid),
      draftInvoiced: money(0),
    },
  })
}

function buildOrder(state: SmallOrderState): MaterialOrderView {
  const contract = buildContract(state)
  return materialOrderViewSchema.parse({
    id: orderId,
    proposalNo: 7,
    orderSeq: 1,
    summary: { names: ['Thép cuộn phi 8'], total: 1 },
    version: contract ? 2 : 1,
    orderState: 'active',
    proposalId,
    approvedRevisionId: '70000000-0000-4000-8000-000000000001',
    supplierId,
    supplierName,
    currencyCode: 'VND',
    allocations: [{
      proposalLineId,
      quantity: QUANTITY,
      unitPrice: money(state.unitPrice),
      quotationMaterialName: 'Xi măng PCB40',
      mappingConfirmed: true,
      orderLineId,
      materialId,
      materialName: 'Xi măng PCB40',
      specification: 'Bao 50 kg',
      unit: 'bao',
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

function buildSummary(state: SmallOrderState): ProjectMaterialFinanceSummary {
  const contract = buildContract(state)
  if (!contract) throw new Error('The finance summary is read only after the order is recorded')
  return projectMaterialFinanceSummarySchema.parse({
    projectId,
    currencyCode: 'VND',
    totals: contract.totals,
    contracts: [{
      contractId,
      projectId,
      projectName: 'Công trình Tòa nhà VQH',
      proposalNo: 7,
      orderSeq: 1,
      orderId,
      supplierId,
      supplierName,
      documentation: contract.documentation,
      contractNo: contract.contractNo,
      totals: contract.totals,
    }],
  })
}

/** Routes every API call of `page` to the in-memory backend `state`. */
async function installMocks(page: Page, state: SmallOrderState) {
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
      if (path === '/material-finance/summary') return route.fulfill({ json: buildSummary(state) })
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
      state.record = recordMaterialContractInputSchema.parse(body)
      return ack(contractId, 1)
    }

    if (path === `/contracts/${contractId}/payment-requests`) {
      const input = createPaymentRequestInputSchema.parse(body)
      const derived = derive(state)
      const target = derived?.installments.find(item => item.installmentKey === input.installmentKey)
      if (!derived || !target) return route.fulfill({ status: 409, json: apiError('INSTALLMENT_NOT_FOUND', 'Không tìm thấy đợt') })
      if (!target.isAdvance && input.invoiceIds.length === 0) {
        return route.fulfill({ status: 409, json: apiError('INVOICE_REQUIRED', 'Cần hóa đơn') })
      }
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
    // The server refuses cash when the committed total is not below the threshold.
    if (input.method === 'cash' && new Decimal(derive(state)?.total ?? 0).greaterThanOrEqualTo(5_000_000)) {
      return route.fulfill({ status: 409, json: apiError('CASH_PAYMENT_NOT_ALLOWED', 'Không được chi tiền mặt.') })
    }
    return bump({
      state: 'paid',
      payment: {
        id: 'f0000000-0000-4000-8000-000000000001',
        paidOn: input.paidOn,
        method: input.method,
        bankReference: input.bankReference,
        proofFileId: input.proofFileId,
        paidBy: treasurerId,
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

async function openAs(page: Page, state: SmallOrderState, user: 'accountant' | 'treasurer', path = orderPath) {
  if (user === 'accountant') await signIn(page, accountant, accountantPermissions)
  else await signIn(page, treasurer, treasurerPermissions)
  await installMocks(page, state)
  await page.goto(path)
}

/** Clears a money field and types the Vietnamese amount key by key, as a user would. */
async function typeMoney(field: ReturnType<Page['getByLabel']>, value: string) {
  await field.fill('')
  await field.pressSequentially(value)
  await expect(field).toHaveValue(value)
}

test.use({ viewport: { width: 1280, height: 900 } })

// Serial tests share one backend state; each test is a fresh page (a new sign-in) on that state.
test.describe('Đơn 4 triệu không hợp đồng, chi tiền mặt (mock dùng chung)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const state = createState('400000')
  const posts = (path: string) => state.calls.filter(call => call.method === 'POST' && call.path === path)

  test('1. kế toán ghi nhận đơn 4.000.000 không hợp đồng với báo giá PNG', async ({ page }) => {
    await openAs(page, state, 'accountant')
    const panel = page.getByTestId('contract-record-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('order-subtotal')).toHaveValue('4.000.000 VND')

    await expect(panel.getByRole('radio', { name: 'Có hợp đồng', exact: true })).toBeChecked()
    await panel.getByRole('radio', { name: 'Không có hợp đồng', exact: true }).check()

    // The contract fields are gone and the date is the record date.
    await expect(page.getByLabel('Số hợp đồng')).toHaveCount(0)
    await expect(page.getByLabel('Hợp đồng đã ký (PDF)')).toHaveCount(0)
    // A no-contract order shows VAT and the total after VAT (C2).
    await expect(page.getByLabel('VAT', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Ngày ghi nhận')).toBeVisible()
    await expect(panel.getByText('Báo giá có ít nhất chữ ký bên bán')).toBeVisible()

    await page.getByLabel('Báo giá có chữ ký', { exact: true }).setInputFiles(png('bao-gia.png'))
    await page.getByLabel('Ngày ghi nhận').fill('2026-10-10')
    await typeMoney(page.getByLabel('Trước VAT', { exact: true }), '4.000.000')
    await typeMoney(page.getByLabel('VAT', { exact: true }), '1.000.000')
    // 4.000.000 + 1.000.000 reaches the threshold: the warning shows and saving is refused.
    await expect(page.getByTestId('quotation-only-summary')).toHaveText('Thanh toán 100% · Tổng 5.000.000')
    await expect(page.getByTestId('quotation-threshold-warning')).toHaveText('Tổng sau VAT từ 5.000.000 đ trở lên phải có hợp đồng.')
    await panel.getByRole('button', { name: 'Lưu ghi nhận' }).click()
    expect(posts(`/orders/${orderId}/contract`)).toHaveLength(0)

    await typeMoney(page.getByLabel('VAT', { exact: true }), '0')
    await expect(page.getByTestId('quotation-threshold-warning')).toHaveCount(0)
    await expect(page.getByTestId('quotation-only-summary')).toHaveText('Thanh toán 100% · Tổng 4.000.000')

    await expect(panel.getByRole('heading', { name: 'Ghi nhận đơn không hợp đồng' })).toBeVisible()
    await panel.getByRole('button', { name: 'Lưu ghi nhận' }).click()
    await expect(page.getByTestId('contract-summary')).toBeVisible()
    await expect(page.getByTestId('contract-summary').getByRole('heading', { name: 'Không hợp đồng' })).toBeVisible()
    await expect(page.getByTestId('contract-summary')).toContainText('Ghi nhận ngày 10/10/2026')
    await expect(page.getByTestId('contract-summary')).toContainText('Bản ghi gốc v1')
    await expect(page.getByTestId('contract-summary')).not.toContainText('Ký ngày')
    await expect(page.getByTestId('total-committed')).toContainText('4.000.000')
    // There is no amendment for an order without a contract.
    await expect(page.getByRole('button', { name: 'Thêm phụ lục', exact: true })).toHaveCount(0)

    const record = recordMaterialContractInputSchema.parse(posts(`/orders/${orderId}/contract`)[0]?.body)
    expect(record).toMatchObject({ documentation: 'quotation_only', signedOn: '2026-10-10', subtotal: '4000000.0000', vatAmount: '0.0000', total: '4000000.0000', varianceReason: null })
    expect(Object.keys(record).sort()).toEqual(['documentation', 'expectedOrderVersion', 'signedOn', 'signedQuotationFileId', 'subtotal', 'total', 'varianceReason', 'vatAmount'])
    expect([...state.evidence.values()].find(item => item.originalFilename === 'bao-gia.png')?.mimeType).toBe('image/png')
  })

  test('2. kế toán lập đề nghị chi kèm hóa đơn nháp (đơn không hợp đồng cũng cần hóa đơn)', async ({ page }) => {
    await openAs(page, state, 'accountant')
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await expect(dialog.getByText('Không hợp đồng - Nhà cung cấp', { exact: false })).toBeVisible()
    await dialog.getByRole('radio', { name: /Thanh toán 100%/ }).check()
    await expect(dialog.getByText(/Đợt không phải tạm ứng: bắt buộc chọn ít nhất một hóa đơn/)).toBeVisible()
    await expect(dialog.getByText('Cần chọn ít nhất một hóa đơn')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Gửi đề nghị chi' })).toBeDisabled()
    await expect(dialog.getByText('Nháp', { exact: true })).toBeVisible()
    await dialog.getByRole('checkbox', { name: /0000123/ }).check()
    await expect(dialog.getByText('Cần chọn ít nhất một hóa đơn')).toHaveCount(0)
    await typeMoney(dialog.getByLabel(/Số tiền đề nghị chi/), '4.000.000')
    await dialog.getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chờ lập UNC' })).toBeVisible()

    expect(createPaymentRequestInputSchema.parse(posts(`/contracts/${contractId}/payment-requests`)[0]?.body)).toMatchObject({
      installmentKey,
      amount: '4000000',
      invoiceIds: [draftInvoiceId],
    })
  })

  test('3. thủ quỹ duyệt rồi chi tiền mặt kèm hóa đơn bán hàng dạng ảnh', async ({ page }) => {
    await openAs(page, state, 'treasurer')
    await page.getByRole('button', { name: 'Xác nhận đã lập UNC / đã chi tiền mặt', exact: true }).click()
    const approve = page.getByRole('dialog', { name: 'Xác nhận đã lập UNC' })
    await approve.getByRole('button', { name: 'Xác nhận đã lập UNC' }).click()
    await expect(approve).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Đã lập UNC – chờ giám đốc duyệt', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true }).click()
    const pay = page.getByRole('dialog')
    await expect(pay.getByRole('radio', { name: 'Chuyển khoản' })).toBeChecked()
    await expect(pay.getByLabel(/Số tham chiếu/)).toBeVisible()
    await pay.getByRole('radio', { name: 'Tiền mặt' }).check()
    await expect(pay.getByLabel(/Số tham chiếu/)).toHaveCount(0)
    await expect(pay.getByText('Hóa đơn bán hàng hoặc phiếu chi hộ').first()).toBeVisible()
    await pay.locator('input[type=file]').setInputFiles(png('hoa-don-ban-hang.png'))
    await pay.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(pay.getByText('Đã tải chứng từ')).toBeVisible()
    await pay.getByRole('button', { name: 'Xác nhận đã chi' }).click()
    await expect(pay).toBeHidden()
    // The linked invoice is still a draft, so the request waits for the official one (C5).
    await expect(page.getByRole('cell', { name: 'Đã chi – chờ hóa đơn chính thức', exact: true })).toBeVisible()

    const payment = state.calls.find(call => call.path.endsWith('/payment'))
    expect(recordMaterialPaymentInputSchema.parse(payment?.body)).toMatchObject({ method: 'cash', bankReference: null, expectedVersion: 2 })
    expect(state.requests[0]?.payment).toMatchObject({ method: 'cash', bankReference: null })
    const proof = [...state.evidence.values()].find(item => item.originalFilename === 'hoa-don-ban-hang.png')
    expect(proof?.mimeType).toBe('image/png')
  })

  test('4. số liệu dự án: đã chi bằng 4.000.000, không tính là chi chưa có hóa đơn', async ({ page }) => {
    await openAs(page, state, 'treasurer', `/materials/${projectId}/finance`)
    // A cold dev server compiles this page on first visit; a production build answers at once.
    await expect(page.getByTestId('material-total-committed').locator('.metric-amount')).toHaveText('4.000.000', { timeout: 120_000 })
    await expect(page.getByTestId('material-total-paid').locator('.metric-amount')).toHaveText('4.000.000')
    await expect(page.getByTestId('material-total-remaining').locator('.metric-amount')).toHaveText('0')
    await expect(page.getByTestId('material-total-paidWithoutInvoice').locator('.metric-amount')).toHaveText('0')
  })
})

test.describe('Đơn 48 triệu vẫn cần hợp đồng và chuyển khoản (mock riêng)', () => {
  test.describe.configure({ timeout: 180_000 })

  test('5. đơn 48.000.000 không hiện lựa chọn "Không có hợp đồng"', async ({ page }) => {
    const state = createState('4800000')
    await openAs(page, state, 'accountant')
    const panel = page.getByTestId('contract-record-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('order-subtotal')).toHaveValue('48.000.000 VND')
    await expect(page.getByRole('radio', { name: 'Không có hợp đồng', exact: true })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Có hợp đồng', exact: true })).toHaveCount(0)
    await expect(page.getByText('Không có hợp đồng')).toHaveCount(0)
    // Only the contract form is offered.
    await expect(page.getByLabel('Số hợp đồng')).toBeVisible()
    await expect(page.getByLabel('Hợp đồng đã ký (PDF)')).toBeVisible()
    await expect(page.getByLabel('Báo giá có chữ ký (PDF)')).toBeVisible()
  })

  test('6. chi cho hợp đồng 48.000.000 không hiện lựa chọn "Tiền mặt"', async ({ page }) => {
    const state = createState('4800000')
    state.record = recordMaterialContractInputSchema.parse({
      documentation: 'contract',
      expectedOrderVersion: 1,
      signedOn: '2026-10-10',
      signedQuotationFileId: 'e0000000-0000-4000-8000-000000000101',
      contractNo: 'HD-VT-2026-48',
      contractFileId: 'e0000000-0000-4000-8000-000000000102',
      subtotal: '48000000.0000',
      vatAmount: '0.0000',
      total: '48000000.0000',
      varianceReason: null,
      installments: [{ installmentKey, name: 'Thanh toán một lần', amount: '48000000.0000', dueOn: '2026-12-10', isAdvance: true }],
    })
    state.requests.push(materialPaymentRequestViewSchema.parse({
      id: 'd0000000-0000-4000-8000-000000000099',
      contractId,
      installmentKey,
      amount: '48000000.0000',
      note: null,
      state: 'approved',
      revisionNo: 1,
      submittedBy: accountantId,
      submittedAt: '2026-10-14T03:00:00.000Z',
      invoiceIds: [],
      cancelReason: null,
      version: 2,
      decisions: [{ revisionNo: 1, decision: 'approve', reason: null, decidedBy: treasurerId, decidedAt: '2026-10-15T04:00:00.000Z' }],
      payment: null,
    }))

    await openAs(page, state, 'treasurer')
    await page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true }).click()
    const pay = page.getByRole('dialog', { name: 'Cập nhật biên lai chuyển khoản' })
    await expect(pay.getByLabel(/Số tham chiếu/)).toBeVisible()
    await expect(pay.getByRole('radio')).toHaveCount(0)
    await expect(pay.getByText('Tiền mặt')).toHaveCount(0)
  })
})
