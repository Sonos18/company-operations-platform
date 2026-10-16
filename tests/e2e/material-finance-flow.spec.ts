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
  projectMaterialFinanceSummarySchema,
  recordMaterialContractInputSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  resubmitPaymentRequestInputSchema,
  type MaterialContractView,
  type MaterialInvoiceView,
  type MaterialPaymentRequestView,
  type ProjectMaterialFinanceSummary,
  type RecordMaterialContractInput,
} from '../../shared/schemas/costs/material-finance'
import { materialOrderViewSchema, type MaterialOrderView } from '../../shared/schemas/costs/material-procurement'
import type { PermissionCode } from '../../shared/constants/permissions'

// One mock backend shared by every route and every user of the test: the accountant records a
// two-installment contract (30% advance, 70% rest), the advance request goes through return,
// resubmit, approval and payment, the project finance page shows the advance as paid, and the
// 70% installment needs a recorded invoice before its request can be sent.

const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000001'
const proposalId = '50000000-0000-4000-8000-000000000001'
const proposalLineId = '60000000-0000-4000-8000-000000000001'
const materialId = '40000000-0000-4000-8000-000000000001'
const orderId = '80000000-0000-4000-8000-000000000001'
const orderLineId = '83000000-0000-4000-8000-000000000001'
const contractId = '90000000-0000-4000-8000-000000000001'
const supplierId = 'a0000000-0000-4000-8000-000000000001'
const accountantId = '11111111-1111-4111-8111-111111111111'
const treasurerId = '22222222-2222-4222-8222-222222222222'

const orderPath = `/materials/${projectId}/orders/${orderId}`
const supplierName = 'Công ty Thép Hòa Phát'

const accountant = { id: accountantId, email: 'ke-toan@taskovia.test' }
const treasurer = { id: treasurerId, email: 'thu-quy@taskovia.test' }
const accountantPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.contract.record', 'material.payment.request']
const treasurerPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.payment.approve', 'material.payment.execute']
const director = { id: '33333333-3333-4333-8333-333333333333', email: 'giam-doc@taskovia.test' }
const directorPermissions: PermissionCode[] = ['material.read', 'material.finance.read']

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nsynthetic') })
const png = { name: 'unc.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }

interface Call {
  method: string
  path: string
  body: unknown
  key: string | undefined
}

interface FlowState {
  contractInput: RecordMaterialContractInput | null
  invoices: MaterialInvoiceView[]
  requests: MaterialPaymentRequestView[]
  evidence: Map<string, { originalFilename: string, mimeType: string, sizeBytes: number, sha256: string }>
  calls: Call[]
  counters: { evidence: number, request: number, invoice: number }
  /** The next officialize command is refused because its file is not a valid evidence file. */
  refuseNextOfficialFile: boolean
}

function createFlowState(): FlowState {
  return { contractInput: null, invoices: [], requests: [], evidence: new Map(), calls: [], counters: { evidence: 0, request: 0, invoice: 0 }, refuseNextOfficialFile: false }
}

const zero = new Decimal(0)
const money = (value: Decimal.Value) => new Decimal(value).toFixed(4)
const sumOf = (items: MaterialPaymentRequestView[]) => items.reduce((acc, item) => acc.plus(item.amount), zero)

function apiError(code: string, message: string) {
  return { error: { code, message, requestId: 'mock-request', details: {} } }
}

function buildContract(state: FlowState): MaterialContractView | null {
  const input = state.contractInput
  if (!input) return null
  const live = state.requests.filter(item => item.state === 'submitted' || item.state === 'approved')
  const paid = state.requests.filter(item => item.state === 'paid')
  const forKey = (items: MaterialPaymentRequestView[], key: string) => items.filter(item => item.installmentKey === key)
  const totalPaid = sumOf(paid)
  const paidWithoutInvoice = sumOf(paid.filter(item => item.invoiceIds.length === 0))
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    supplierId,
    supplierName,
    currencyCode: 'VND',
    contractNo: input.contractNo,
    signedOn: input.signedOn,
    currentVersionNo: 1,
    version: 1,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: input.subtotal,
      vatAmount: input.vatAmount,
      total: input.total,
      orderSubtotalSnapshot: '1000000.0000',
      varianceReason: input.varianceReason,
      contractFileId: input.contractFileId,
      signedQuotationFileId: input.signedQuotationFileId,
      reason: null,
      recordedBy: accountantId,
      recordedAt: '2026-10-10T03:00:00.000Z',
    }],
    installments: input.installments.map((item, index) => {
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
      committed: money(input.total),
      paid: money(totalPaid),
      pending: money(sumOf(live)),
      remaining: money(new Decimal(input.total).minus(totalPaid)),
      overdue: money(0),
      invoiced: money(state.invoices.filter(item => item.state === 'recorded').reduce((acc, item) => acc.plus(item.total), zero)),
      paidWithoutInvoice: money(paidWithoutInvoice),
      draftInvoiced: money(0),
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
      unitPrice: '100000.0000',
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
      ? { id: contract.id, contractNo: contract.contractNo, signedOn: contract.signedOn, currentVersionNo: 1, total: contract.versions[0]?.total ?? null }
      : null,
    cash: contract
      ? { committed: contract.totals.committed, paid: contract.totals.paid, pending: contract.totals.pending, remaining: contract.totals.remaining }
      : null,
  })
}

function buildSummary(state: FlowState): ProjectMaterialFinanceSummary {
  const contract = buildContract(state)
  if (!contract) throw new Error('The finance summary is read only after the contract is recorded')
  return projectMaterialFinanceSummarySchema.parse({
    projectId,
    currencyCode: 'VND',
    totals: contract.totals,
    contracts: [{
      contractId, projectId, orderId, supplierId, supplierName, contractNo: contract.contractNo, totals: contract.totals,
    }],
  })
}

/** Routes every API call of `page` to the shared in-memory backend `state`. */
async function installFlowMocks(page: Page, state: FlowState) {

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
    state.calls.push({ method, path, body, key: request.headers()['idempotency-key'] })
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
      state.contractInput = recordMaterialContractInputSchema.parse(body)
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
      if (state.refuseNextOfficialFile) {
        state.refuseNextOfficialFile = false
        return route.fulfill({ status: 409, json: apiError('EVIDENCE_INVALID', 'Tệp không hợp lệ.') })
      }
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
      const installment = state.contractInput?.installments.find(item => item.installmentKey === input.installmentKey)
      if (!installment) return route.fulfill({ status: 409, json: apiError('INSTALLMENT_NOT_FOUND', 'Không tìm thấy đợt') })
      if (!installment.isAdvance && input.invoiceIds.length === 0) {
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

    const match = /^\/payment-requests\/([^/]+)(?:\/(decisions|payment))?$/.exec(path)
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

    if (!match[2]) {
      const input = resubmitPaymentRequestInputSchema.parse(body)
      return bump({ state: 'submitted', amount: money(input.amount), invoiceIds: input.invoiceIds, note: input.note, revisionNo: current.revisionNo + 1 })
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
        id: 'f0000000-0000-4000-8000-000000000001', paidOn: input.paidOn, bankReference: input.bankReference,
        proofFileId: input.proofFileId, paidBy: treasurerId, recordedAt: '2026-10-15T05:00:00.000Z',
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

/** Clears a money field and types the Vietnamese amount key by key, as a user would. */
async function typeMoney(field: ReturnType<Page['getByLabel']>, value: string) {
  await field.fill('')
  await field.pressSequentially(value)
  await expect(field).toHaveValue(value)
}

test.use({ viewport: { width: 1280, height: 900 } })

// Serial tests share one backend state; each test is a fresh page (a new sign-in) on that state.
test.describe('Luồng hợp đồng và chi tiền vật tư (mock dùng chung)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  const state = createFlowState()
  const posts = (path: string) => state.calls.filter(call => call.method === 'POST' && call.path === path)
  const installment = (isAdvance: boolean) => state.contractInput?.installments.find(item => item.isAdvance === isAdvance)

  async function openAs(page: Page, user: 'accountant' | 'treasurer' | 'director', path = orderPath) {
    if (user === 'accountant') await signIn(page, accountant, accountantPermissions)
    else if (user === 'treasurer') await signIn(page, treasurer, treasurerPermissions)
    else await signIn(page, director, directorPermissions)
    await installFlowMocks(page, state)
    await page.goto(path)
  }

  test('1. kế toán ghi hợp đồng 1.100.000 với tạm ứng 30% và đợt còn lại 70%', async ({ page }) => {
    await openAs(page, 'accountant')
    const panel = page.getByTestId('contract-record-panel')
    await expect(panel).toBeVisible()

    await page.getByLabel('Hợp đồng đã ký (PDF)').setInputFiles(pdf('hop-dong.pdf'))
    await page.getByLabel('Báo giá có chữ ký (PDF)').setInputFiles(pdf('bao-gia.pdf'))
    await page.getByLabel('Số hợp đồng').fill('HD-VT-2026-01')
    await page.getByLabel('Ngày ký').fill('2026-10-10')
    await typeMoney(page.getByLabel('Trước VAT', { exact: true }), '1.000.000')
    await expect(page.getByTestId('contract-subtotal-interpreted')).toHaveText('Hiểu là: 1.000.000')
    await typeMoney(page.getByLabel('VAT', { exact: true }), '100.000')
    await expect(page.getByLabel('Tổng giá trị hợp đồng')).toHaveValue('1.100.000')

    await panel.getByRole('button', { name: 'Thêm đợt' }).click()
    await page.getByLabel('Tên đợt 1').fill('Tạm ứng 30%')
    await page.getByLabel('Tỷ lệ đợt 1').fill('30')
    await page.getByLabel('Tạm ứng đợt 1').check()
    await page.getByLabel('Tên đợt 2').fill('Thanh toán còn lại')
    await page.getByLabel('Hạn đợt 2').fill('2026-12-10')
    await expect(page.getByTestId('installment-amount-1')).toHaveText('330.000')
    await expect(page.getByTestId('installment-amount-2')).toHaveText('770.000')
    await expect(page.getByTestId('installment-balance')).toContainText('Khớp')

    await panel.getByRole('button', { name: 'Lưu hợp đồng' }).click()
    await expect(page.getByTestId('contract-summary')).toBeVisible()
    await expect(page.getByTestId('total-committed')).toContainText('1.100.000')

    const record = recordMaterialContractInputSchema.parse(posts(`/orders/${orderId}/contract`)[0]?.body)
    expect([record.subtotal, record.vatAmount, record.total]).toEqual(['1000000.0000', '100000.0000', '1100000.0000'])
    expect(record.installments.map(item => [item.name, item.amount, item.isAdvance])).toEqual([
      ['Tạm ứng 30%', '330000.0000', true],
      ['Thanh toán còn lại', '770000.0000', false],
    ])
  })

  test('2. kế toán lập đề nghị tạm ứng không kèm hóa đơn', async ({ page }) => {
    await openAs(page, 'accountant')
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await dialog.getByRole('radio', { name: /Tạm ứng 30%/ }).check()
    await expect(dialog.getByText('Đợt tạm ứng: không bắt buộc đính kèm hóa đơn.')).toBeVisible()
    await typeMoney(dialog.getByLabel(/Số tiền đề nghị chi/), '330.000')
    await expect(dialog.getByTestId('request-amount-interpreted')).toHaveText('Hiểu là: 330.000')
    await dialog.getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chờ lập UNC' })).toBeVisible()

    expect(createPaymentRequestInputSchema.parse(posts(`/contracts/${contractId}/payment-requests`)[0]?.body)).toMatchObject({
      installmentKey: installment(true)?.installmentKey,
      amount: '330000',
      invoiceIds: [],
    })
  })

  test('3. thủ quỹ trả lại đề nghị kèm lý do', async ({ page }) => {
    await openAs(page, 'treasurer')
    await page.getByRole('button', { name: 'Trả lại', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Trả lại đề nghị chi' })
    await dialog.getByLabel(/Lý do trả lại đề nghị chi/).pressSequentially('Thiếu đề nghị tạm ứng có ký duyệt')
    await dialog.getByRole('button', { name: 'Xác nhận trả lại' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Bị trả lại' })).toBeVisible()
    expect(state.requests[0]?.state).toBe('returned')
  })

  test('4. kế toán gửi lại đề nghị', async ({ page }) => {
    await openAs(page, 'accountant')
    await page.getByRole('button', { name: 'Gửi lại', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Gửi lại đề nghị thanh toán' })
    await expect(dialog.getByLabel(/Số tiền đề nghị chi/)).toHaveValue('330.000')
    await dialog.getByRole('button', { name: 'Gửi lại đề nghị' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chờ lập UNC' })).toBeVisible()

    const patch = state.calls.find(call => call.method === 'PATCH')
    expect(resubmitPaymentRequestInputSchema.parse(patch?.body)).toMatchObject({ expectedVersion: 2, amount: '330000', invoiceIds: [] })
  })

  test('5. thủ quỹ duyệt rồi ghi nhận đã chi với ủy nhiệm chi', async ({ page }) => {
    await openAs(page, 'treasurer')
    await page.getByRole('button', { name: 'Xác nhận đã lập UNC / đã chi tiền mặt', exact: true }).click()
    const approve = page.getByRole('dialog', { name: 'Xác nhận đã lập UNC' })
    await approve.getByRole('button', { name: 'Xác nhận đã lập UNC' }).click()
    await expect(approve).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Đã lập UNC – chờ giám đốc duyệt', exact: true })).toBeVisible()
    const decisions = state.calls.filter(call => call.path.endsWith('/decisions')).map(call => decidePaymentRequestInputSchema.parse(call.body))
    expect(decisions).toEqual([
      { expectedVersion: 1, decision: 'return', reason: 'Thiếu đề nghị tạm ứng có ký duyệt' },
      { expectedVersion: 3, decision: 'approve' },
    ])

    await page.getByRole('button', { name: 'Cập nhật biên lai chuyển khoản', exact: true }).click()
    const pay = page.getByRole('dialog', { name: 'Cập nhật biên lai chuyển khoản' })
    await pay.getByLabel(/Số tham chiếu/).pressSequentially('FT26288000189')
    await pay.locator('input[type=file]').setInputFiles(png)
    await pay.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(pay.getByText('Đã tải chứng từ')).toBeVisible()
    await pay.getByRole('button', { name: 'Xác nhận đã chi' }).click()
    await expect(pay).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Đã chi', exact: true })).toBeVisible()
    const payment = state.calls.find(call => call.path.endsWith('/payment'))
    expect(recordMaterialPaymentInputSchema.parse(payment?.body)).toMatchObject({ expectedVersion: 4, bankReference: 'FT26288000189' })
  })

  test('6. số liệu dự án: đã chi bằng tiền tạm ứng', async ({ page }) => {
    await openAs(page, 'treasurer', `/materials/${projectId}/finance`)
    // A cold dev server compiles this page on first visit; a production build answers at once.
    await expect(page.getByTestId('material-total-committed').locator('.metric-amount')).toHaveText('1.100.000', { timeout: 120_000 })
    await expect(page.getByTestId('material-total-paid').locator('.metric-amount')).toHaveText('330.000')
    await expect(page.getByTestId('material-total-remaining').locator('.metric-amount')).toHaveText('770.000')
    await expect(page.getByTestId('material-total-paidWithoutInvoice').locator('.metric-amount')).toHaveText('330.000')
  })

  test('7. đợt 70% bị chặn khi chưa có hóa đơn', async ({ page }) => {
    await openAs(page, 'accountant')
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    // The paid advance has nothing left, so only the 70% installment is offered.
    await expect(dialog.getByRole('radio')).toHaveCount(1)
    await dialog.getByRole('radio', { name: /Thanh toán còn lại/ }).check()
    await expect(dialog.getByText('Cần chọn ít nhất một hóa đơn')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Gửi đề nghị chi' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Hủy bỏ' }).click()
    await expect(dialog).toBeHidden()
    expect(posts(`/contracts/${contractId}/payment-requests`)).toHaveLength(1)
  })

  test('8. nhập hóa đơn 770.000 rồi lập đề nghị đợt 70% thành công', async ({ page }) => {
    await openAs(page, 'accountant')
    await page.getByRole('button', { name: 'Nhập hóa đơn' }).click()
    const invoice = page.getByRole('dialog', { name: 'Nhập hóa đơn nhà cung cấp' })
    await invoice.locator('#invoice-file-input').setInputFiles(pdf('hoa-don.pdf'))
    await invoice.getByRole('button', { name: 'Tải lên tệp' }).click()
    await expect(invoice.getByText('Đã tải lên tệp')).toBeVisible()
    await invoice.locator('#inv-symbol-input').pressSequentially('1C26TAA')
    await invoice.locator('#inv-no-input').pressSequentially('0000456')
    await typeMoney(invoice.locator('#inv-subtotal-input'), '700.000')
    await typeMoney(invoice.locator('#inv-vat-input'), '70.000')
    await expect(invoice.locator('#inv-total-input')).toHaveValue('770.000')
    await invoice.getByLabel('Tên vật tư trên hóa đơn:').pressSequentially('Thép cuộn phi 8 (HĐ)')
    await invoice.getByRole('button', { name: 'Ghi nhận hóa đơn' }).click()
    await expect(invoice).toBeHidden()
    await expect(page.getByRole('cell', { name: '1C26TAA' })).toBeVisible()
    const recordedInvoice = recordMaterialInvoiceInputSchema.parse(posts(`/contracts/${contractId}/invoices`)[0]?.body)
    expect([recordedInvoice.subtotal, recordedInvoice.vatAmount, recordedInvoice.total]).toEqual(['700000', '70000', '770000'])
    // The stage defaults to the draft / signed copy waiting for the official invoice (C3).
    expect(recordedInvoice.stage).toBe('draft')
    await expect(page.getByRole('cell', { name: 'Nháp', exact: true })).toBeVisible()
    const invoiceId = state.invoices[0]?.id

    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await dialog.getByRole('radio', { name: /Thanh toán còn lại/ }).check()
    await dialog.getByRole('checkbox', { name: /0000456/ }).check()
    await expect(dialog.getByText('Cần chọn ít nhất một hóa đơn')).toHaveCount(0)
    await typeMoney(dialog.getByLabel(/Số tiền đề nghị chi/), '770.000')
    await dialog.getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chờ lập UNC' })).toBeVisible()

    const creates = posts(`/contracts/${contractId}/payment-requests`)
    expect(creates).toHaveLength(2)
    expect(createPaymentRequestInputSchema.parse(creates[1]?.body)).toMatchObject({
      installmentKey: installment(false)?.installmentKey,
      amount: '770000',
      invoiceIds: [invoiceId],
    })
  })

  test('8b. kế toán cập nhật hóa đơn chính thức cho hóa đơn nháp', async ({ page }) => {
    await openAs(page, 'accountant')
    await expect(page.getByRole('cell', { name: 'Nháp', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cập nhật hóa đơn chính thức' })
    await dialog.locator('#official-file-input').setInputFiles(pdf('hoa-don-chinh-thuc.pdf'))
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải lên tệp')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('cell', { name: 'Chính thức', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' })).toHaveCount(0)
    const call = posts(`/invoices/${state.invoices[0]?.id}/official`)[0]
    expect(officializeMaterialInvoiceInputSchema.parse(call?.body)).toMatchObject({ expectedVersion: 1 })
  })

  test('8c. tệp hóa đơn chính thức bị từ chối thì phải chọn tệp khác', async ({ page }) => {
    // 8b already officialized the invoice, so put it back to a draft for this scenario.
    const draft = materialInvoiceViewSchema.parse({ ...state.invoices[0], stage: 'draft', officialFileId: null, officializedAt: null, version: 1 })
    state.invoices[0] = draft
    state.refuseNextOfficialFile = true
    await openAs(page, 'accountant')
    await page.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cập nhật hóa đơn chính thức' })
    await dialog.locator('#official-file-input').setInputFiles(pdf('hoa-don-loi.pdf'))
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải lên tệp')).toBeVisible()
    const confirm = dialog.getByRole('button', { name: 'Cập nhật hóa đơn chính thức' })
    await confirm.click()

    // The refused file is dropped: nothing to resend until another file is uploaded.
    await expect(dialog.getByRole('alert')).toContainText('Vui lòng chọn lại tệp')
    await expect(dialog.getByText('Đã tải lên tệp')).toHaveCount(0)
    await expect(confirm).toBeDisabled()
    await expect(dialog.getByText('Tệp:')).toHaveCount(0)

    await dialog.locator('#official-file-input').setInputFiles(pdf('hoa-don-dung.pdf'))
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải lên tệp')).toBeVisible()
    await confirm.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('cell', { name: 'Chính thức', exact: true })).toBeVisible()
    const attempts = posts(`/invoices/${draft.id}/official`)
    expect(attempts.length).toBeGreaterThanOrEqual(2)
    const bodies = attempts.slice(-2).map(call => officializeMaterialInvoiceInputSchema.parse(call.body).officialFileId)
    expect(bodies[0]).not.toBe(bodies[1])
  })

  // The server gate that lets finance-only roles read orders is covered by unit tests
  // (material-orders.spec.ts) and pgTAP (c1_material_finance_access); this checks the page.
  test('9. giám đốc chỉ có quyền xem số liệu mở được trang đơn, thấy hợp đồng nhưng không có thao tác', async ({ page }) => {
    await openAs(page, 'director')
    await expect(page.getByTestId('contract-summary')).toBeVisible()
    await expect(page.getByTestId('total-committed')).toContainText('1.100.000')
    await expect(page.getByRole('cell', { name: '1C26TAA' })).toBeVisible()
    for (const action of ['Lập đề nghị chi', 'Nhập hóa đơn', 'Xác nhận đã lập UNC / đã chi tiền mặt', 'Xác nhận đã lập UNC', 'Trả lại', 'Cập nhật biên lai chuyển khoản', 'Thêm phụ lục']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0)
    }
  })
})
