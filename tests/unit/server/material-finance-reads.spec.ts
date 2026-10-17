import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMaterialFinanceReadRoutes } from '../../../server/features/costs/material-finance/finance-read-routes'
import { MaterialFinanceReadService, type MaterialFinanceReadDataRepository } from '../../../server/features/costs/material-finance/finance-read-service'

const { getRouterParam, readBody } = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
}))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(),
  getRouterParam,
  readBody,
}))

const p1 = '30000000-0000-4000-8000-000000000001'
const s1 = '30000000-0000-4000-8000-000000000002'
const s2 = '30000000-0000-4000-8000-000000000003'
const k = (n: number) => `30000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`
const contractFacts = (n: number, supplierId: string, total: string, paid: string, dueOn: string) => ({
  contractId: k(n), projectId: p1, projectName: 'Dự án 1', proposalNo: 18, orderSeq: n, orderId: k(n + 50), supplierId,
  supplierName: supplierId === s1 ? 'NCC A' : 'NCC B', documentation: 'contract' as const, contractNo: 'HD-' + n as string | null, total, invoiced: '0.0000', draftInvoiced: '0.0000',
  installments: [{ installmentKey: k(n + 20), name: 'Đợt 1', amount: total, dueOn, paid, pending: '0.0000' }],
})
const facts = {
  currencyCode: 'VND',
  contracts: [
    contractFacts(1, s1, '100.0000', '30.0000', '2026-10-01'),
    contractFacts(2, s1, '50.0000', '0.0000', '2026-10-17'),
    contractFacts(3, s2, '20.0000', '20.0000', '2026-09-01'),
  ],
}
const ctx = (permissions: string[]) => ({ actorId: k(99), tenantId: k(98), companyId: k(97), requestId: k(96), permissions }) as never
const repo = (): MaterialFinanceReadDataRepository => ({
  financeFacts: vi.fn(async () => facts),
  inboxFacts: vi.fn(async () => ({ awaitingContract: [], returnedRequests: [], pendingApproval: [], approvedAwaitingPayment: [] })),
  listNotifications: vi.fn(async () => ({ items: [], nextCursor: null })),
  readNotification: vi.fn(async () => ({ resourceId: k(1), version: 1, replayed: false })),
  readAllNotifications: vi.fn(async () => ({ material: 0, cost: 0 })),
})
const now = () => new Date('2026-10-15T01:00:00Z')

describe('material finance read service', () => {
  it('summarizes a project', async () => {
    const summary = await new MaterialFinanceReadService(repo(), now).projectSummary(ctx(['material.read', 'material.finance.read']), p1)
    expect(summary.totals).toMatchObject({ committed: '170.0000', paid: '50.0000', remaining: '120.0000', overdue: '70.0000' })
    expect(summary.contracts).toHaveLength(3)
  })

  it('groups supplier balances', async () => {
    const suppliers = await new MaterialFinanceReadService(repo(), now).suppliers(ctx(['material.read', 'material.finance.read']))
    expect(suppliers.map(s => [s.supplierName, s.totals.remaining])).toEqual([['NCC A', '120.0000'], ['NCC B', '0.0000']])
  })

  it('keeps documentation and a null contract number on project and supplier rows', async () => {
    const quotationOnly = { ...contractFacts(4, s2, '10.0000', '4.0000', '2026-12-01'), documentation: 'quotation_only' as const, contractNo: null }
    const data = repo()
    vi.mocked(data.financeFacts).mockResolvedValue({ currencyCode: 'VND', contracts: [facts.contracts[0]!, quotationOnly] })
    const service = new MaterialFinanceReadService(data, now)
    const permissions = ctx(['material.read', 'material.finance.read'])

    const summary = await service.projectSummary(permissions, p1)
    expect(summary.contracts.map(row => [row.contractId, row.documentation, row.contractNo]))
      .toEqual([[k(1), 'contract', 'HD-1'], [k(4), 'quotation_only', null]])
    expect(summary.contracts[1]?.totals.paidWithoutInvoice).toBe('4.0000')

    const suppliers = await service.suppliers(permissions)
    const rows = suppliers.flatMap(supplier => supplier.contracts)
    expect(rows.find(row => row.contractId === k(4))).toMatchObject({ documentation: 'quotation_only', contractNo: null })
    expect(rows.find(row => row.contractId === k(1))).toMatchObject({ documentation: 'contract', contractNo: 'HD-1' })
  })

  it('builds due installments for accountants only', async () => {
    const service = new MaterialFinanceReadService(repo(), now)
    const accountant = await service.inbox(ctx(['material.read', 'material.contract.record']))
    expect(accountant.dueInstallments.map(i => [i.contractId, i.dueStatus])).toEqual([[k(1), 'overdue'], [k(2), 'due_soon']])
    const treasurer = await service.inbox(ctx(['material.read', 'material.payment.approve']))
    expect(treasurer.dueInstallments).toEqual([])
  })

  it('copies the project name, proposal number and order sequence onto summary rows and due installments', async () => {
    const service = new MaterialFinanceReadService(repo(), now)
    const permissions = ['material.read', 'material.finance.read', 'material.contract.record']
    const code = (row: { projectName: string, proposalNo: number, orderSeq: number }) => [row.projectName, row.proposalNo, row.orderSeq]

    const summary = await service.projectSummary(ctx(permissions), p1)
    expect(summary.contracts.map(code)).toEqual([['Dự án 1', 18, 1], ['Dự án 1', 18, 2], ['Dự án 1', 18, 3]])

    const suppliers = await service.suppliers(ctx(permissions))
    expect(suppliers.flatMap(supplier => supplier.contracts).map(code))
      .toEqual([['Dự án 1', 18, 1], ['Dự án 1', 18, 2], ['Dự án 1', 18, 3]])

    const inbox = await service.inbox(ctx(permissions))
    expect(inbox.dueInstallments.map(code)).toEqual([['Dự án 1', 18, 1], ['Dự án 1', 18, 2]])
  })

  it('passes the opaque notification cursor through and accepts an opaque next cursor', async () => {
    const data = repo()
    const cursor = 'abcdef0123'
    vi.mocked(data.listNotifications).mockResolvedValueOnce({ items: [], nextCursor: '3230323' })
    const page = await new MaterialFinanceReadService(data, now).listNotifications(ctx(['material.read']), cursor)
    expect(data.listNotifications).toHaveBeenCalledWith(expect.anything(), cursor)
    expect(page.nextCursor).toBe('3230323')
  })

  it('denies summary without finance permission', async () => {
    await expect(new MaterialFinanceReadService(repo(), now).projectSummary(ctx(['material.read', 'material.order.manage']), p1))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('read-all notifications route', () => {
  const companyId = k(97)
  const rpc = vi.fn()
  const routes = () => createMaterialFinanceReadRoutes({
    resolveContext: async () => ({ ...(ctx([]) as object), companyId, db: { rpc } }) as never,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getRouterParam.mockReturnValue(companyId)
    rpc.mockResolvedValue({ data: { material: 3, cost: 1 }, error: null })
  })

  it('maps the body to the database RPC arguments and parses the counts', async () => {
    readBody.mockResolvedValue({ materialUpTo: '2026-10-17T01:00:00+07:00', costUpTo: null })
    await expect(routes().readAllNotifications({} as never)).resolves.toEqual({ material: 3, cost: 1 })
    expect(rpc).toHaveBeenCalledWith('c1_mark_notifications_read_all', {
      target_company_id: companyId,
      target_material_up_to: '2026-10-17T01:00:00+07:00',
      target_cost_up_to: null,
    })
  })

  it.each([
    ['an unknown key', { materialUpTo: null, costUpTo: null, extra: 1 }],
    ['an invalid datetime', { materialUpTo: 'yesterday', costUpTo: null }],
    ['a datetime without offset', { materialUpTo: '2026-10-17T01:00:00', costUpTo: null }],
    ['a missing field', { materialUpTo: null }],
  ])('rejects %s before calling the database', async (_name, input) => {
    readBody.mockResolvedValue(input)
    await expect(routes().readAllNotifications({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a malformed RPC result', async () => {
    readBody.mockResolvedValue({ materialUpTo: null, costUpTo: null })
    rpc.mockResolvedValue({ data: { material: -1, cost: 0 }, error: null })
    await expect(routes().readAllNotifications({} as never)).rejects.toBeDefined()
  })
})
