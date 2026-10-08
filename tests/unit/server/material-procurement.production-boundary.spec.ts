import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMaterialProcurementRoutes } from '../../../server/features/costs/material-procurement/routes'
import { ids, purchasingRoleScope, split10Of20 } from '../material-procurement/fixtures'

const { createClient, getHeader, getRouterParam, readBody } = vi.hoisted(() => ({
  createClient: vi.fn(), getHeader: vi.fn(), getRouterParam: vi.fn(), readBody: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
vi.mock('h3', async importOriginal => ({
  ...await importOriginal<typeof import('h3')>(), getHeader, getRouterParam, readBody,
}))

const url = 'http://127.0.0.1:54321'
const publicKey = 'fake-public-key'
const serviceKey = 'fake-service-role-key'
const companyId = '10000000-0000-4000-8000-000000000001'
const tenantId = '10000000-0000-4000-8000-000000000002'
const requestId = '10000000-0000-4000-8000-000000000003'
const idempotencyKey = '10000000-0000-4000-8000-000000000004'
const objectPath = `${tenantId}/${companyId}/${ids.project}/${ids.unsignedQuotation}`
const bytes = new TextEncoder().encode('%PDF-1.7 material quotation')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const finalized = {
  id: ids.unsignedQuotation, status: 'finalized', originalFilename: 'quotation.pdf',
  mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256, version: 1,
  finalizedAt: '2026-10-08T08:00:00.000Z', replayed: false,
}
const event = { context: { requestId } } as never
const userRpc = vi.fn()
const serviceRpc = vi.fn()
const download = vi.fn()
const createSignedUrl = vi.fn()
let authorized: boolean
let targetStatus: 'pending_upload' | 'finalized'
let declaredSha256: string

function serviceCreationOrder() {
  const index = createClient.mock.calls.findIndex(([_url, key]) => key === serviceKey)
  return createClient.mock.invocationCallOrder[index]!
}
function serviceCalls() { return createClient.mock.calls.filter(([_url, key]) => key === serviceKey) }
function targetOrder() {
  const index = userRpc.mock.calls.findIndex(([name]) => name === 'c1_material_evidence_finalization_target')
  return userRpc.mock.invocationCallOrder[index]!
}

describe('production material route service-role boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorized = true
    targetStatus = 'pending_upload'
    declaredSha256 = sha256
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: url, supabaseAnonKey: publicKey },
      supabaseServiceRoleKey: serviceKey,
    }))
    getHeader.mockImplementation((_event, name) => name === 'authorization'
      ? authorized ? 'Bearer fake-user-token' : undefined
      : name === 'idempotency-key' ? idempotencyKey : undefined)
    getRouterParam.mockImplementation((_event, name) => ({
      companyId, projectId: ids.project, proposalId: ids.proposal,
      orderId: ids.order, fileId: ids.unsignedQuotation,
    } as Record<string, string>)[String(name)])
    const membershipQuery = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{ tenant_id: tenantId, company_id: companyId, companies: { code: 'VQH', name: 'VQH' } }],
        error: null,
      }).then(resolve),
    }
    userRpc.mockImplementation(async (name: string) => {
      if (name === 'is_company_member') return { data: true, error: null }
      if (name === 'get_my_company_access') {
        return { data: [{ roles: ['purchasing'], permissions: purchasingRoleScope }], error: null }
      }
      if (name === 'c1_material_evidence_finalization_target') {
        return { data: targetStatus === 'finalized' ? { status: 'finalized' } : {
          status: 'pending_upload', bucketId: 'c1-accounting-evidence', objectPath,
          declaredMimeType: 'application/pdf', declaredSizeBytes: bytes.byteLength, declaredSha256,
        }, error: null }
      }
      if (name === 'c1_material_create_order') {
        return { data: { resourceId: ids.order, version: 1, replayed: false }, error: null }
      }
      if (name === 'c1_material_create_evidence_intent') {
        return { data: { evidenceFileId: ids.unsignedQuotation, version: 0,
          bucketId: 'c1-accounting-evidence', objectPath, expiresAt: '2026-10-08T08:15:00.000Z',
          replayed: false }, error: null }
      }
      if (name === 'c1_material_evidence_read_target') {
        return { data: { bucketId: 'c1-accounting-evidence', objectPath }, error: null }
      }
      if (name === 'c1_material_list_proposals' || name === 'c1_material_list_orders') {
        return { data: [], error: null }
      }
      throw new Error(`Unexpected user RPC: ${name}`)
    })
    download.mockResolvedValue({ data: new Blob([bytes], { type: 'application/pdf' }), error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.invalid/material' }, error: null })
    serviceRpc.mockImplementation(async () => ({
      data: { ...finalized, replayed: targetStatus === 'finalized' }, error: null,
    }))
    createClient.mockImplementation((_url: string, key: string) => {
      if (key === publicKey) return {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: ids.user } }, error: null })) },
        from: vi.fn(() => membershipQuery), rpc: userRpc,
        storage: { from: vi.fn(() => ({ download, createSignedUrl })) },
      }
      if (key === serviceKey) return { rpc: serviceRpc }
      throw new Error('Unexpected SDK key')
    })
  })

  it('authenticates before constructing a privileged client', async () => {
    const routes = createSupabaseMaterialProcurementRoutes(event)
    expect(serviceCalls()).toHaveLength(0)
    authorized = false
    await expect(routes.listProposals(event)).rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' })
    expect(serviceCalls()).toHaveLength(0)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('keeps proposal, order, intent, and read routes on the user client', async () => {
    const routes = createSupabaseMaterialProcurementRoutes(event)
    readBody
      .mockResolvedValueOnce({
        approvedRevisionId: ids.proposalRevision, supplierId: ids.supplier, currencyCode: 'VND',
        unsignedQuotationEvidenceFileId: ids.unsignedQuotation, allocations: [split10Of20.allocations[0]],
      })
      .mockResolvedValueOnce({
        originalFilename: 'quotation.pdf', mimeType: 'application/pdf', sizeBytes: bytes.byteLength,
        sha256, evidenceRole: 'unsigned_quotation',
        target: { kind: 'material_proposal', proposalId: ids.proposal, revisionId: ids.proposalRevision },
      })
      .mockResolvedValueOnce({ disposition: 'attachment' })
    await routes.listProposals(event)
    await routes.createOrder(event)
    await routes.listOrders(event)
    await routes.createEvidenceIntent(event)
    await routes.readEvidenceUrl(event)
    expect(serviceCalls()).toHaveLength(0)
    expect(userRpc.mock.calls.map(([name]) => name)).toContain('c1_material_evidence_read_target')
    expect(createSignedUrl).toHaveBeenCalledOnce()
  })

  it('verifies pending bytes before constructing the privileged client', async () => {
    const routes = createSupabaseMaterialProcurementRoutes(event)
    readBody.mockResolvedValue({ expectedVersion: 0 })
    declaredSha256 = '0'.repeat(64)
    await expect(routes.finalizeEvidence(event)).rejects.toMatchObject({ code: 'EVIDENCE_UPLOAD_MISMATCH' })
    expect(serviceCalls()).toHaveLength(0)
    expect(targetOrder()).toBeLessThan(download.mock.invocationCallOrder[0]!)

    vi.clearAllMocks()
    declaredSha256 = sha256
    await expect(routes.finalizeEvidence(event)).resolves.toMatchObject({ id: ids.unsignedQuotation })
    expect(serviceCalls()).toHaveLength(1)
    expect(userRpc).toHaveBeenCalledWith('c1_material_evidence_finalization_target', {
      target_company_id: companyId, target_project_id: ids.project, target_id: ids.unsignedQuotation,
    })
    expect(serviceRpc).toHaveBeenCalledWith('c1_finalize_material_evidence_server', expect.objectContaining({
      target_actor_id: ids.user,
      target_input: { expectedVersion: 0, mimeType: 'application/pdf', sizeBytes: bytes.byteLength, sha256 },
    }))
    expect(targetOrder()).toBeLessThan(download.mock.invocationCallOrder[0]!)
    expect(download.mock.invocationCallOrder[0]).toBeLessThan(serviceCreationOrder())
    expect(serviceCreationOrder()).toBeLessThan(serviceRpc.mock.invocationCallOrder[0]!)
  })

  it('looks up finalized replay before privileged RPC without download', async () => {
    targetStatus = 'finalized'
    readBody.mockResolvedValue({ expectedVersion: 0 })
    await expect(createSupabaseMaterialProcurementRoutes(event).finalizeEvidence(event))
      .resolves.toMatchObject({ replayed: true })
    expect(download).not.toHaveBeenCalled()
    expect(targetOrder()).toBeLessThan(serviceCreationOrder())
    expect(serviceCreationOrder()).toBeLessThan(serviceRpc.mock.invocationCallOrder[0]!)
  })
})
