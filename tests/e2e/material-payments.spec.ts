import Decimal from 'decimal.js'
import { expect, test } from './fixtures/authenticated'
import type { Page, Route } from '@playwright/test'
import { createAuthTestState, createCompany, installAuthRoutes } from './fixtures/auth-routes'
import {
  cancelPaymentRequestInputSchema,
  createPaymentRequestInputSchema,
  decidePaymentRequestInputSchema,
  materialContractViewSchema,
  materialFinanceInboxSchema,
  materialInvoiceViewSchema,
  materialPaymentRequestViewSchema,
  recordMaterialInvoiceInputSchema,
  recordMaterialPaymentInputSchema,
  resubmitPaymentRequestInputSchema,
  type MaterialContractView,
  type MaterialFinanceInbox,
  type MaterialInvoiceView,
  type MaterialPaymentRequestView,
} from '../../shared/schemas/costs/material-finance'
import {
  materialOrderViewSchema,
  type MaterialOrderView,
  type MaterialProjectOption,
} from '../../shared/schemas/costs/material-procurement'
import type { PermissionCode } from '../../shared/constants/permissions'

const accountantId = '11111111-1111-4111-8111-111111111111'
const treasurerId = '22222222-2222-4222-8222-222222222222'

const projectId = '30000000-0000-4000-8000-000000000001'
const orderId = '80000000-0000-4000-8000-000000000001'
const contractId = '90000000-0000-4000-8000-000000000001'
const supplierId = 'a0000000-0000-4000-8000-000000000001'
const advanceKey = 'b0000000-0000-4000-8000-000000000001'
const regularKey = 'b0000000-0000-4000-8000-000000000002'
const invoiceId = 'c0000000-0000-4000-8000-000000000001'
const invoiceFileId = 'c0000000-0000-4000-8000-0000000000f1'
const requestId = 'd0000000-0000-4000-8000-000000000001'
const proofFileId = 'e0000000-0000-4000-8000-000000000001'
const proposalId = '50000000-0000-4000-8000-000000000001'
const proposalLineId = '60000000-0000-4000-8000-000000000001'
const orderLineId = '83000000-0000-4000-8000-000000000001'
const materialId = '40000000-0000-4000-8000-000000000001'
const contractFileId = 'e0000000-0000-4000-8000-0000000000c1'
const tenantId = '10000000-0000-4000-8000-000000000001'
const companyId = '10000000-0000-4000-8000-000000000002'

const orderPath = `/materials/${projectId}/orders/${orderId}`
const proofAlreadyUsedMessage = 'Tệp ủy nhiệm chi này đã được dùng cho một lần chi khác. Hãy chọn tệp khác.'

interface Call {
  method: string
  path: string
  body: unknown
  key: string | undefined
}

interface FinanceState {
  invoices: MaterialInvoiceView[]
  requests: MaterialPaymentRequestView[]
  calls: Call[]
  proofAlreadyUsed: boolean
  loseFirstCreateResponse: boolean
  receipts: Map<string, { resourceId: string, version: number }>
  lastIntent: { originalFilename: string, mimeType: string, sizeBytes: number, sha256: string } | null
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function money(value: Decimal) {
  return value.toFixed(4)
}

function buildRequest(overrides: Partial<MaterialPaymentRequestView> = {}): MaterialPaymentRequestView {
  return materialPaymentRequestViewSchema.parse({
    id: requestId,
    contractId,
    installmentKey: regularKey,
    amount: '400.0000',
    note: null,
    state: 'submitted',
    revisionNo: 1,
    submittedBy: accountantId,
    submittedAt: '2026-10-14T03:00:00.000Z',
    invoiceIds: [invoiceId],
    cancelReason: null,
    version: 1,
    decisions: [],
    payment: null,
    ...overrides,
  })
}

function buildInvoice(): MaterialInvoiceView {
  return materialInvoiceViewSchema.parse({
    id: invoiceId,
    contractId,
    invoiceSymbol: '1C26TAA',
    invoiceNo: '0000123',
    issuedOn: '2026-10-10',
    subtotal: '500.0000',
    vatAmount: '50.0000',
    total: '550.0000',
    fileId: invoiceFileId,
    state: 'recorded',
    voidReason: null,
    version: 1,
    lines: [],
  })
}

function buildContract(state: FinanceState): MaterialContractView {
  const live = state.requests.filter(item => item.state === 'submitted' || item.state === 'approved')
  const paid = state.requests.filter(item => item.state === 'paid')
  const sum = (items: MaterialPaymentRequestView[], key: string) =>
    items.filter(item => item.installmentKey === key).reduce((acc, item) => acc.plus(item.amount), new Decimal(0))
  const installment = (key: string, name: string, amount: string, isAdvance: boolean, dueOn: string, seq: number) => {
    const paidAmount = sum(paid, key)
    const pendingAmount = sum(live, key)
    return {
      installmentKey: key,
      name,
      amount,
      dueOn,
      isAdvance,
      seq,
      paid: money(paidAmount),
      pending: money(pendingAmount),
      remaining: money(new Decimal(amount).minus(paidAmount).minus(pendingAmount)),
      dueStatus: 'not_due',
    }
  }
  const totalPaid = paid.reduce((acc, item) => acc.plus(item.amount), new Decimal(0))
  const totalPending = live.reduce((acc, item) => acc.plus(item.amount), new Decimal(0))
  return materialContractViewSchema.parse({
    id: contractId,
    orderId,
    projectId,
    supplierId,
    supplierName: 'Công ty Thép Hòa Phát',
    currencyCode: 'VND',
    contractNo: 'HD-2026-001',
    signedOn: '2026-10-01',
    currentVersionNo: 1,
    version: 1,
    versions: [{
      versionNo: 1,
      kind: 'original',
      subtotal: '909.0909',
      vatAmount: '90.9091',
      total: '1000.0000',
      orderSubtotalSnapshot: '909.0909',
      varianceReason: null,
      contractFileId,
      signedQuotationFileId: null,
      reason: null,
      recordedBy: accountantId,
      recordedAt: '2026-10-01T03:00:00.000Z',
    }],
    installments: [
      installment(advanceKey, 'Tạm ứng 10%', '100.0000', true, '2026-10-20', 1),
      installment(regularKey, 'Thanh toán đợt 2', '900.0000', false, '2026-11-20', 2),
    ],
    totals: {
      committed: '1000.0000',
      paid: money(totalPaid),
      pending: money(totalPending),
      remaining: money(new Decimal(1000).minus(totalPaid)),
      overdue: '0.0000',
      invoiced: state.invoices.reduce((acc, item) => acc.plus(item.total), new Decimal(0)).toFixed(4),
      paidWithoutInvoice: '0.0000',
    },
  })
}

function buildOrder(contract: MaterialContractView): MaterialOrderView {
  return materialOrderViewSchema.parse({
    id: orderId,
    version: 2,
    orderState: 'active',
    proposalId,
    approvedRevisionId: '70000000-0000-4000-8000-000000000001',
    supplierId,
    supplierName: contract.supplierName,
    currencyCode: 'VND',
    allocations: [{
      proposalLineId,
      quantity: '10.0000',
      unitPrice: '90.9091',
      quotationMaterialName: 'Thép cuộn phi 8',
      mappingConfirmed: true,
      orderLineId,
      materialId,
      materialName: 'Thép cuộn phi 8',
      specification: 'CB240-T',
      unit: 'kg',
    }],
    unsignedQuotationEvidenceFileId: '85000000-0000-4000-8000-000000000001',
    contract: {
      id: contract.id,
      contractNo: contract.contractNo,
      signedOn: contract.signedOn,
      currentVersionNo: contract.currentVersionNo,
      total: contract.versions[0]?.total ?? null,
    },
    cash: {
      committed: contract.totals.committed,
      paid: contract.totals.paid,
      pending: contract.totals.pending,
      remaining: contract.totals.remaining,
    },
  })
}

function errorBody(code: string, message: string) {
  return { error: { code, message, requestId: 'mock-request', details: {} } }
}

function findRequest(state: FinanceState, id: string) {
  const index = state.requests.findIndex(item => item.id === id)
  if (index < 0) throw new Error('Unknown mock payment request ' + id)
  return index
}

async function installFinanceMocks(page: Page, initial: Partial<FinanceState> = {}) {
  const state: FinanceState = {
    invoices: [],
    requests: [],
    calls: [],
    proofAlreadyUsed: false,
    loseFirstCreateResponse: false,
    receipts: new Map(),
    lastIntent: null,
    ...initial,
  }
  let nextRequestNo = 2

  await page.route('https://api.iconify.design/**', route => route.fulfill({ json: { prefix: 'lucide', icons: {} } }))
  await page.route('https://auth.taskovia.test/storage/v1/**', route =>
    route.fulfill({ json: { Key: 'synthetic', Id: proofFileId }, headers: { 'Access-Control-Allow-Origin': '*' } }))

  await page.route(/\/api\/companies\/[^/]+\/projects\/[^/]+\/material-procurement\/.*$/, async (route: Route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.split('/material-procurement')[1] ?? ''
    const method = req.method()

    if (method === 'GET') {
      if (path === `/orders/${orderId}`) return route.fulfill({ json: buildOrder(buildContract(state)) })
      if (path === `/orders/${orderId}/contract`) return route.fulfill({ json: buildContract(state) })
      if (path === `/contracts/${contractId}/invoices`) return route.fulfill({ json: state.invoices })
      if (path === `/contracts/${contractId}/payment-requests`) return route.fulfill({ json: state.requests })
      return route.fulfill({ status: 404, json: errorBody('RESOURCE_NOT_FOUND', 'Không tìm thấy ' + path) })
    }

    const body = req.postDataJSON() as unknown
    state.calls.push({ method, path, body, key: req.headers()['idempotency-key'] })
    const ack = (resourceId: string, version: number) => route.fulfill({ json: { resourceId, version, replayed: false } })

    if (path === '/evidence/upload-intents') {
      state.lastIntent = body as FinanceState['lastIntent']
      return route.fulfill({
        json: {
          evidenceFileId: proofFileId,
          version: 0,
          bucketId: 'c1-accounting-evidence',
          objectPath: [tenantId, companyId, projectId, proofFileId].join('/'),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          replayed: false,
        },
      })
    }
    if (path === `/evidence/${proofFileId}/finalize`) {
      return route.fulfill({
        json: {
          id: proofFileId,
          status: 'finalized',
          originalFilename: state.lastIntent?.originalFilename ?? 'unc.png',
          mimeType: state.lastIntent?.mimeType ?? 'image/png',
          sizeBytes: state.lastIntent?.sizeBytes ?? png.length,
          sha256: state.lastIntent?.sha256 ?? 'a'.repeat(64),
          version: 1,
          finalizedAt: new Date().toISOString(),
          replayed: false,
        },
      })
    }

    if (path === `/contracts/${contractId}/invoices` && method === 'POST') {
      const input = recordMaterialInvoiceInputSchema.parse(body)
      state.invoices.push(materialInvoiceViewSchema.parse({
        id: invoiceId,
        contractId,
        ...input,
        state: 'recorded',
        voidReason: null,
        version: 1,
      }))
      return ack(invoiceId, 1)
    }

    if (path === `/contracts/${contractId}/payment-requests` && method === 'POST') {
      const input = createPaymentRequestInputSchema.parse(body)
      const receiptKey = req.headers()['idempotency-key'] ?? ''
      const replay = state.receipts.get(receiptKey)
      if (replay) return route.fulfill({ json: { ...replay, replayed: true } })
      const created = buildRequest({
        id: `d0000000-0000-4000-8000-00000000000${nextRequestNo++}`,
        installmentKey: input.installmentKey,
        amount: input.amount,
        note: input.note,
        invoiceIds: input.invoiceIds,
        submittedBy: accountantId,
      })
      state.requests.push(created)
      state.receipts.set(receiptKey, { resourceId: created.id, version: created.version })
      if (state.loseFirstCreateResponse) {
        // The server committed, but the response never reaches the browser.
        state.loseFirstCreateResponse = false
        return route.abort('failed')
      }
      return ack(created.id, created.version)
    }

    const requestMatch = /^\/payment-requests\/([^/]+)(?:\/(cancel|decisions|payment))?$/.exec(path)
    if (!requestMatch) return route.fulfill({ status: 404, json: errorBody('RESOURCE_NOT_FOUND', 'Không tìm thấy ' + path) })
    const id = requestMatch[1]!
    const action = requestMatch[2]
    const index = findRequest(state, id)
    const current = state.requests[index]!

    const bumped = (changes: Partial<MaterialPaymentRequestView>) => {
      const next = buildRequest({ ...current, ...changes, version: current.version + 1 })
      state.requests[index] = next
      return ack(id, next.version)
    }
    const expectedVersion = (body as { expectedVersion: number }).expectedVersion
    if (expectedVersion !== current.version) {
      return route.fulfill({ status: 409, json: errorBody('VERSION_CONFLICT', 'Phiên bản không khớp.') })
    }

    if (!action) {
      const input = resubmitPaymentRequestInputSchema.parse(body)
      return bumped({ state: 'submitted', amount: input.amount, invoiceIds: input.invoiceIds, note: input.note, revisionNo: current.revisionNo + 1 })
    }
    if (action === 'cancel') {
      const input = cancelPaymentRequestInputSchema.parse(body)
      return bumped({ state: 'cancelled', cancelReason: input.reason })
    }
    if (action === 'decisions') {
      const input = decidePaymentRequestInputSchema.parse(body)
      const decision = {
        revisionNo: current.revisionNo,
        decision: input.decision,
        reason: input.reason ?? null,
        decidedBy: treasurerId,
        decidedAt: '2026-10-15T04:00:00.000Z',
      }
      return bumped({ state: input.decision === 'approve' ? 'approved' : 'returned', decisions: [...current.decisions, decision] })
    }

    const input = recordMaterialPaymentInputSchema.parse(body)
    if (state.proofAlreadyUsed) {
      return route.fulfill({ status: 409, json: errorBody('PROOF_ALREADY_USED', 'Proof already used') })
    }
    return bumped({
      state: 'paid',
      payment: {
        id: 'f0000000-0000-4000-8000-000000000001',
        paidOn: input.paidOn,
        bankReference: input.bankReference,
        proofFileId: input.proofFileId,
        paidBy: treasurerId,
        recordedAt: '2026-10-15T05:00:00.000Z',
      },
    })
  })

  return state
}

async function signIn(page: Page, user: { id: string, email: string }, permissions: PermissionCode[]) {
  await installAuthRoutes(page, createAuthTestState({
    user,
    sessionCompanies: [createCompany({ tenantId, companyId, permissions })],
  }))
}

const accountant = { id: accountantId, email: 'ke-toan@taskovia.test' }
const treasurer = { id: treasurerId, email: 'thu-quy@taskovia.test' }
const accountantPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.contract.record', 'material.payment.request']
const treasurerPermissions: PermissionCode[] = ['material.read', 'material.finance.read', 'material.payment.approve', 'material.payment.execute']

test.describe('Material invoices, payment requests and finance inbox', () => {
  test('1. accountant files a 33 advance request without an invoice', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const state = await installFinanceMocks(page)

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()

    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await expect(dialog.getByRole('radio', { name: /Tạm ứng 10%/ })).toBeChecked()
    await expect(dialog.getByText('Đợt tạm ứng: không bắt buộc đính kèm hóa đơn.')).toBeVisible()
    // Real key presses: every keystroke re-renders the dialog and must not move focus away.
    await dialog.getByLabel(/Số tiền đề nghị chi/).fill('')
    await dialog.getByLabel(/Số tiền đề nghị chi/).pressSequentially('33')
    await expect(dialog.getByLabel(/Số tiền đề nghị chi/)).toHaveValue('33')
    await expect(dialog.getByTestId('request-amount-interpreted')).toHaveText('Hiểu là: 33')
    await dialog.getByLabel('Ghi chú đề nghị chi').pressSequentially('Tạm ứng đợt 1')
    await expect(dialog.getByLabel('Ghi chú đề nghị chi')).toHaveValue('Tạm ứng đợt 1')
    await dialog.getByRole('button', { name: 'Gửi đề nghị chi' }).click()

    await expect(dialog).toBeHidden()
    const post = state.calls.find(call => call.method === 'POST' && call.path === `/contracts/${contractId}/payment-requests`)
    expect(post).toBeDefined()
    expect(createPaymentRequestInputSchema.parse(post?.body)).toEqual({
      installmentKey: advanceKey,
      amount: '33',
      invoiceIds: [],
      note: 'Tạm ứng đợt 1',
    })
    expect(post?.key).toBeTruthy()
    await expect(page.getByRole('cell', { name: 'Chờ duyệt' })).toBeVisible()
  })

  test('2. a regular installment without an invoice cannot be submitted', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const state = await installFinanceMocks(page)

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()

    const dialog = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await dialog.getByRole('radio', { name: /Thanh toán đợt 2/ }).check()

    await expect(dialog.getByText('Cần chọn ít nhất một hóa đơn')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Gửi đề nghị chi' })).toBeDisabled()
    expect(state.calls).toHaveLength(0)
  })

  test('3. treasurer must give a reason to return a request', async ({ page }) => {
    await signIn(page, treasurer, treasurerPermissions)
    const state = await installFinanceMocks(page, { invoices: [buildInvoice()], requests: [buildRequest()] })

    await page.goto(orderPath)
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Trả lại', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Trả lại đề nghị chi' })
    const confirm = dialog.getByRole('button', { name: 'Xác nhận trả lại' })
    await expect(confirm).toBeDisabled()
    await expect(dialog.getByText('Cần nhập lý do khi trả lại đề nghị')).toBeVisible()
    expect(state.calls).toHaveLength(0)

    await dialog.getByLabel(/Lý do trả lại đề nghị chi/).pressSequentially('Thiếu bảng đối chiếu khối lượng')
    await expect(dialog.getByLabel(/Lý do trả lại đề nghị chi/)).toHaveValue('Thiếu bảng đối chiếu khối lượng')
    await confirm.click()

    await expect(dialog).toBeHidden()
    const post = state.calls.find(call => call.path === `/payment-requests/${requestId}/decisions`)
    expect(decidePaymentRequestInputSchema.parse(post?.body)).toEqual({
      expectedVersion: 1,
      decision: 'return',
      reason: 'Thiếu bảng đối chiếu khối lượng',
    })
    await expect(page.getByRole('cell', { name: 'Bị trả lại' })).toBeVisible()
  })

  test('4. accountant resubmits a returned request with the new version', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const returned = buildRequest({
      state: 'returned',
      version: 2,
      decisions: [{ revisionNo: 1, decision: 'return', reason: 'Thiếu bảng đối chiếu', decidedBy: treasurerId, decidedAt: '2026-10-15T04:00:00.000Z' }],
    })
    const state = await installFinanceMocks(page, { invoices: [buildInvoice()], requests: [returned] })

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Gửi lại', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Gửi lại đề nghị thanh toán' })
    await expect(dialog.getByRole('radio', { name: /Thanh toán đợt 2/ })).toBeChecked()
    await dialog.getByLabel(/Số tiền đề nghị chi/).fill('')
    await dialog.getByLabel(/Số tiền đề nghị chi/).pressSequentially('350,5')
    await expect(dialog.getByLabel(/Số tiền đề nghị chi/)).toHaveValue('350,5')
    await expect(dialog.getByTestId('request-amount-interpreted')).toHaveText('Hiểu là: 350,5')
    await dialog.getByRole('button', { name: 'Gửi lại đề nghị' }).click()

    await expect(dialog).toBeHidden()
    const patch = state.calls.find(call => call.method === 'PATCH')
    expect(patch?.path).toBe(`/payment-requests/${requestId}`)
    expect(resubmitPaymentRequestInputSchema.parse(patch?.body)).toEqual({
      expectedVersion: 2,
      amount: '350.5',
      invoiceIds: [invoiceId],
      note: null,
    })
    await expect(page.getByRole('cell', { name: 'Chờ duyệt' })).toBeVisible()
  })

  test('5. treasurer approves, then records the payment with a PNG proof', async ({ page }) => {
    await signIn(page, treasurer, treasurerPermissions)
    const state = await installFinanceMocks(page, { invoices: [buildInvoice()], requests: [buildRequest()] })

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
    await page.getByRole('dialog', { name: 'Phê duyệt đề nghị chi' }).getByRole('button', { name: 'Xác nhận duyệt' }).click()
    await expect(page.getByRole('cell', { name: 'Đã duyệt', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Ghi chi', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Ghi nhận chuyển khoản thực chi' })
    await dialog.getByLabel(/Số tham chiếu/).pressSequentially('FT26288000189')
    await expect(dialog.getByLabel(/Số tham chiếu/)).toHaveValue('FT26288000189')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'unc.png', mimeType: 'image/png', buffer: png })
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải chứng từ')).toBeVisible()
    await dialog.getByRole('button', { name: 'Xác nhận đã chi' }).click()

    await expect(dialog).toBeHidden()
    const post = state.calls.find(call => call.path === `/payment-requests/${requestId}/payment`)
    const parsed = recordMaterialPaymentInputSchema.parse(post?.body)
    expect(parsed).toMatchObject({ expectedVersion: 2, bankReference: 'FT26288000189', proofFileId })
    await expect(page.getByRole('cell', { name: 'Đã chi', exact: true })).toBeVisible()
  })

  test('6. a proof file that was already used shows a Vietnamese message', async ({ page }) => {
    await signIn(page, treasurer, treasurerPermissions)
    await installFinanceMocks(page, {
      invoices: [buildInvoice()],
      requests: [buildRequest({ state: 'approved', version: 2 })],
      proofAlreadyUsed: true,
    })

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Ghi chi', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Ghi nhận chuyển khoản thực chi' })
    await dialog.getByLabel(/Số tham chiếu/).fill('FT26288000190')
    await dialog.locator('input[type=file]').setInputFiles({ name: 'unc.png', mimeType: 'image/png', buffer: png })
    await dialog.getByRole('button', { name: 'Tải lên', exact: true }).click()
    await expect(dialog.getByText('Đã tải chứng từ')).toBeVisible()
    await dialog.getByRole('button', { name: 'Xác nhận đã chi' }).click()

    await expect(dialog.getByRole('alert').filter({ hasText: proofAlreadyUsedMessage })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Xác nhận đã chi' })).toBeDisabled()
  })
})

test.describe('Material payment dialogs: stale data, retries and typing', () => {
  test('8. a stale request version closes the dialog, reloads and the retry uses the new version', async ({ page }) => {
    await signIn(page, treasurer, treasurerPermissions)
    const state = await installFinanceMocks(page, { invoices: [buildInvoice()], requests: [buildRequest()] })

    await page.goto(orderPath)
    await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toBeVisible()
    // Someone else changes the request after the page loaded.
    state.requests[0] = buildRequest({ version: 2 })

    await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Phê duyệt đề nghị chi' })
    await dialog.getByRole('button', { name: 'Xác nhận duyệt' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('alert').filter({ hasText: 'Dữ liệu đã thay đổi' })).toBeVisible()

    await page.getByRole('button', { name: 'Duyệt', exact: true }).click()
    await page.getByRole('dialog', { name: 'Phê duyệt đề nghị chi' }).getByRole('button', { name: 'Xác nhận duyệt' }).click()
    await expect(page.getByRole('cell', { name: 'Đã duyệt', exact: true })).toBeVisible()

    const decisions = state.calls.filter(call => call.path === `/payment-requests/${requestId}/decisions`)
    expect(decisions.map(call => decidePaymentRequestInputSchema.parse(call.body).expectedVersion)).toEqual([1, 2])
    expect(decisions[0]?.key).not.toBe(decisions[1]?.key)
  })

  test('9. a lost response keeps the idempotency key when the dialog is closed and reopened', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const state = await installFinanceMocks(page, { loseFirstCreateResponse: true })

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    const first = page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' })
    await first.getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(first.getByRole('alert')).toBeVisible()
    await first.getByRole('button', { name: 'Hủy bỏ' }).click()
    await expect(first).toBeHidden()

    await page.getByRole('button', { name: 'Lập đề nghị chi' }).click()
    await page.getByRole('dialog', { name: 'Lập đề nghị thanh toán chi' }).getByRole('button', { name: 'Gửi đề nghị chi' }).click()
    await expect(page.getByRole('cell', { name: 'Chờ duyệt' })).toBeVisible()

    const creates = state.calls.filter(call => call.method === 'POST' && call.path === `/contracts/${contractId}/payment-requests`)
    expect(creates).toHaveLength(2)
    expect(creates[0]?.key).toBeTruthy()
    expect(creates[1]?.key).toBe(creates[0]?.key)
    expect(state.requests).toHaveLength(1)
  })

  test('10. accountant records an invoice, typing Vietnamese amounts key by key', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const state = await installFinanceMocks(page)

    await page.goto(orderPath)
    await page.getByRole('button', { name: 'Nhập hóa đơn' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nhập hóa đơn nhà cung cấp' })

    await dialog.locator('#invoice-file-input').setInputFiles({ name: 'hoa-don.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 invoice') })
    await dialog.getByRole('button', { name: 'Tải lên tệp' }).click()
    await expect(dialog.getByText('Đã tải lên tệp')).toBeVisible()

    await dialog.locator('#inv-symbol-input').pressSequentially('1C26TAA')
    await expect(dialog.locator('#inv-symbol-input')).toHaveValue('1C26TAA')
    await dialog.locator('#inv-no-input').pressSequentially('0000123')
    await expect(dialog.locator('#inv-no-input')).toHaveValue('0000123')
    await dialog.locator('#inv-subtotal-input').fill('')
    await dialog.locator('#inv-subtotal-input').pressSequentially('1.000.000')
    await expect(dialog.locator('#inv-subtotal-input')).toHaveValue('1.000.000')
    await dialog.locator('#inv-vat-input').fill('')
    await dialog.locator('#inv-vat-input').pressSequentially('100.000')
    await expect(dialog.locator('#inv-vat-input')).toHaveValue('100.000')
    await expect(dialog.locator('#inv-total-input')).toHaveValue('1.100.000')

    await dialog.getByLabel('Tên vật tư trên hóa đơn:').pressSequentially('Thép cuộn phi 8 (HĐ)')
    await expect(dialog.getByLabel('Tên vật tư trên hóa đơn:')).toHaveValue('Thép cuộn phi 8 (HĐ)')
    await dialog.getByRole('button', { name: 'Ghi nhận hóa đơn' }).click()

    await expect(dialog).toBeHidden()
    const post = state.calls.find(call => call.path === `/contracts/${contractId}/invoices`)
    expect(recordMaterialInvoiceInputSchema.parse(post?.body)).toMatchObject({
      invoiceSymbol: '1C26TAA',
      invoiceNo: '0000123',
      subtotal: '1000000',
      vatAmount: '100000',
      total: '1100000',
      fileId: proofFileId,
      lines: [{ proposalLineId, invoiceMaterialName: 'Thép cuộn phi 8 (HĐ)' }],
    })
    await expect(page.getByRole('cell', { name: '1C26TAA' })).toBeVisible()
  })
})

const projects: MaterialProjectOption[] = [
  { projectId, code: 'DA-VQH-01', name: 'Công trình Tòa nhà VQH', locationText: null },
]

const inbox: MaterialFinanceInbox = materialFinanceInboxSchema.parse({
  awaitingContract: [{
    projectId, projectName: 'Công trình Tòa nhà VQH', orderId, supplierName: 'Công ty Thép Hòa Phát',
    orderSubtotal: '909.0909', createdAt: '2026-10-14T03:00:00.000Z',
  }],
  dueInstallments: [],
  returnedRequests: [],
  pendingApproval: [{
    projectId, projectName: 'Công trình Tòa nhà VQH', orderId, supplierName: 'Công ty Thép Hòa Phát',
    contractId, requestId, amount: '400.0000', submittedBy: accountantId, submittedAt: '2026-10-14T03:00:00.000Z',
  }],
  approvedAwaitingPayment: [],
})

async function installInboxMocks(page: Page) {
  const urls: string[] = []
  await page.route(/\/api\/companies\/[^/]+\/material-procurement\/projects$/, route => route.fulfill({ json: projects }))
  await page.route(/\/api\/companies\/[^/]+\/material-finance\/inbox(?:\?.*)?$/, (route) => {
    urls.push(route.request().url())
    return route.fulfill({ json: inbox })
  })
  return urls
}

test.describe('Material finance inbox', () => {
  test('7. treasurer inbox has only the treasurer tabs and rows open the order page', async ({ page }) => {
    await signIn(page, treasurer, treasurerPermissions)
    await installInboxMocks(page)

    await page.goto('/materials/finance')

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(2)
    await expect(page.getByRole('tab', { name: /Chờ duyệt/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Đã duyệt – chờ chi/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Đơn chờ hợp đồng/ })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /Đề nghị bị trả lại/ })).toHaveCount(0)

    await expect(page.getByRole('cell', { name: 'Công ty Thép Hòa Phát' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Công nợ nhà cung cấp' })).toHaveAttribute('href', '/materials/finance/suppliers')
    await page.getByRole('link', { name: 'Xét duyệt' }).click()
    await expect(page).toHaveURL(new RegExp(`${orderPath}$`))
  })

  test('7b. accountant inbox has only the accountant tabs and can filter by project', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions)
    const inboxUrls = await installInboxMocks(page)

    await page.goto('/materials/finance')

    await expect(page.getByRole('tab')).toHaveCount(3)
    await expect(page.getByRole('tab', { name: /Đơn chờ hợp đồng/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Đợt sắp\/quá hạn/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Đề nghị bị trả lại/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Chờ duyệt/ })).toHaveCount(0)

    await page.getByLabel('Dự án:').selectOption(projectId)
    await expect.poll(() => inboxUrls.some(url => url.includes(`projectId=${projectId}`))).toBe(true)

    await page.getByRole('tab', { name: /Đợt sắp\/quá hạn/ }).click()
    await expect(page.getByText('Không có đợt thanh toán nào sắp hoặc quá hạn.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Làm mới dữ liệu' })).toBeEnabled()
  })

  test('7d. approve and execute permissions each open only their own tab', async ({ page }) => {
    await signIn(page, treasurer, ['material.read', 'material.payment.approve'])
    await installInboxMocks(page)

    await page.goto('/materials/finance')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: /Chờ duyệt/ })).toBeVisible()

    await signIn(page, treasurer, ['material.read', 'material.payment.execute'])
    await page.goto('/materials/finance')
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: /Đã duyệt – chờ chi/ })).toBeVisible()
  })

  test('7c. an inbox load failure shows a message and reload recovers', async ({ page }) => {
    await signIn(page, accountant, accountantPermissions.filter(permission => permission !== 'material.finance.read'))
    let failures = 1
    await page.route(/\/api\/companies\/[^/]+\/material-procurement\/projects$/, route => route.fulfill({ json: projects }))
    await page.route(/\/api\/companies\/[^/]+\/material-finance\/inbox(?:\?.*)?$/, (route) => {
      if (failures > 0) {
        failures -= 1
        return route.fulfill({ status: 400, json: errorBody('INPUT_INVALID', 'Yêu cầu không hợp lệ') })
      }
      return route.fulfill({ json: inbox })
    })

    await page.goto('/materials/finance')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Công nợ nhà cung cấp' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('cell', { name: 'Công ty Thép Hòa Phát' })).toBeVisible()
  })
})
